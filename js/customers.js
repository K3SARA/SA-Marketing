class CustomersPage {
  constructor() {
    this.customers = [];
    this.bills = [];
    this.bound = false;
    this.selectedCustomerId = null;
  }

  getSearchQuery() {
    const input = document.getElementById('customers-search');
    return (input?.value || '').trim().toLowerCase();
  }

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  getDeleteIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>';
  }

  computeOutstandingMap() {
    const map = new Map();
    this.bills.forEach((bill) => {
      if (bill.billStatus && bill.billStatus !== 'active') return;
      const key = (bill.customerName || '').trim().toLowerCase();
      if (!key || key === 'walk-in customer') return;

      const total = Money.round(bill.total);
      const received = Money.round(bill.receivedAmount || 0);
      const balance = typeof bill.balanceAmount === 'number'
        ? Money.clampZero(bill.balanceAmount)
        : Money.clampZero(Money.subtract(total, received));

      if (!Money.isPositive(balance)) return;
      map.set(key, Money.add(map.get(key) || 0, balance));
    });

    return map;
  }

  computeOutstandingForCustomer(name) {
    const map = this.computeOutstandingMap();
    const key = (name || '').trim().toLowerCase();
    return map.get(key) || 0;
  }

  getFilteredCustomers() {
    const query = this.getSearchQuery();
    const outstandingMap = this.computeOutstandingMap();

    const rows = this.customers.map((customer) => {
      const key = (customer.name || '').trim().toLowerCase();
      const outstanding = outstandingMap.get(key) || 0;
      return { ...customer, outstanding };
    });

    if (!query) return rows;
    return rows.filter((c) => (c.name || '').toLowerCase().includes(query));
  }

  openEditModal(customerId) {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) return;

    this.selectedCustomerId = customerId;
    document.getElementById('customer-modal-title').innerText = 'Edit Customer';

    const nameInput = document.getElementById('edit-customer-name');
    const phoneInput = document.getElementById('edit-customer-phone');
    const addressInput = document.getElementById('edit-customer-address');

    if (nameInput) nameInput.value = customer.name || '';
    if (phoneInput) phoneInput.value = customer.phone || '';
    if (addressInput) addressInput.value = customer.address || '';

    app.openModal('customer-edit-modal');
  }

  openAddModal() {
    this.selectedCustomerId = null;
    document.getElementById('customer-modal-title').innerText = 'Add New Customer';

    const nameInput = document.getElementById('edit-customer-name');
    const phoneInput = document.getElementById('edit-customer-phone');
    const addressInput = document.getElementById('edit-customer-address');

    if (nameInput) nameInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (addressInput) addressInput.value = '';

    app.openModal('customer-edit-modal');
  }

  closeEditModal() {
    this.selectedCustomerId = null;
    app.closeModal('customer-edit-modal');
  }

  async saveSelectedCustomer() {
    const name = (document.getElementById('edit-customer-name')?.value || '').trim();
    const phone = (document.getElementById('edit-customer-phone')?.value || '').trim();
    const address = (document.getElementById('edit-customer-address')?.value || '').trim();

    if (!name) {
      alert('Customer name is required.');
      return;
    }

    const duplicate = this.customers.find((customer) => {
      const sameName = (customer.name || '').trim().toLowerCase() === name.toLowerCase();
      const sameCustomer = Number(customer.id) === Number(this.selectedCustomerId);
      return sameName && !sameCustomer;
    });
    if (duplicate) {
      alert('Customer already exists.');
      return;
    }

    if (this.selectedCustomerId) {
      const existingCustomer = this.customers.find((customer) => Number(customer.id) === Number(this.selectedCustomerId));
      await window.db.updateCustomer(this.selectedCustomerId, { name, phone, address });
      const renamedBills = await window.db.renameCustomerInBills(existingCustomer?.name || '', { name, phone, address });
      await window.db.addAuditLog({
        action: 'customer_update',
        entity: 'customer',
        entityId: this.selectedCustomerId,
        details: { name, renamedBills }
      });
    } else {
      const result = await window.db.addCustomer(name, phone, address);
      if (!result?.ok) {
        alert(result?.error || 'Failed to add customer.');
        return;
      }
      await window.db.addAuditLog({
        action: 'customer_create',
        entity: 'customer',
        entityId: result.id,
        details: { name }
      });
    }

    this.closeEditModal();
    await this.render();

    if (window.billing) {
      await window.billing.loadCustomerDirectory();
      await window.billing.loadOutstandingDirectory();
    }
  }

  async deleteCustomer(customerId) {
    const customer = this.customers.find((c) => Number(c.id) === Number(customerId));
    if (!customer) return;

    const outstanding = this.computeOutstandingForCustomer(customer.name);
    let message = `Delete customer "${customer.name}"? Old bills for this customer will stay unchanged.`;
    if (outstanding > 0) {
      message = `⚠️ "${customer.name}" has LKR ${outstanding.toLocaleString()} outstanding!\n\nDelete anyway? Old bills will stay unchanged.`;
    }

    const confirmed = confirm(message);
    if (!confirmed) return;

    const deleted = await window.db.deleteCustomer(customer.id);
    if (!deleted) {
      alert('Failed to delete customer.');
      return;
    }

    await window.db.addAuditLog({
      action: 'customer_delete',
      entity: 'customer',
      entityId: customer.id,
      details: { name: customer.name || '' }
    });
    await this.render();
    if (window.billing) {
      await window.billing.loadCustomerDirectory();
      await window.billing.loadOutstandingDirectory();
    }
  }

  renderList(customers) {
    const list = document.getElementById('customers-list');
    if (!list) return;

    if (this.customers.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">No customers yet.</div>';
      return;
    }

    if (customers.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">No customers match your search.</div>';
      return;
    }

    const rows = customers.map((c) => {
      const phone = c.phone || '-';
      const outstanding = c.outstanding > 0
        ? `<span class="customers-due">LKR ${c.outstanding.toLocaleString()}</span>`
        : '<span class="customers-paid">Paid</span>';

      return `
        <tr>
          <td><button class="customers-name-btn" data-edit-customer-id="${c.id}">${this.escapeHtml(c.name || '-')}</button></td>
          <td>${this.escapeHtml(phone)}</td>
          <td>${outstanding}</td>
          <td><button class="customers-delete-btn" data-delete-customer-id="${c.id}" title="Delete customer" aria-label="Delete customer">${this.getDeleteIcon()}</button></td>
        </tr>
      `;
    }).join('');

    list.innerHTML = `
      <div class="card customers-table-wrap">
        <table class="customers-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Outstanding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    list.querySelectorAll('[data-edit-customer-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const customerId = Number(btn.getAttribute('data-edit-customer-id'));
        this.openEditModal(customerId);
      });
    });

    list.querySelectorAll('[data-delete-customer-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const customerId = Number(btn.getAttribute('data-delete-customer-id'));
        await this.deleteCustomer(customerId);
      });
    });
  }

  bindEvents() {
    if (this.bound) return;

    const searchInput = document.getElementById('customers-search');
    searchInput?.addEventListener('input', () => {
      this.renderList(this.getFilteredCustomers());
    });

    const addBtn = document.getElementById('btn-add-customer');
    addBtn?.addEventListener('click', () => {
      this.openAddModal();
    });

    const saveBtn = document.getElementById('btn-save-customer-edit');
    saveBtn?.addEventListener('click', async () => {
      await this.saveSelectedCustomer();
    });

    this.bound = true;
  }

  async render() {
    const list = document.getElementById('customers-list');
    if (list) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">Loading...</div>';
    }

    this.bindEvents();
    this.customers = await window.db.getCustomers();
    this.bills = await window.db.getBills();
    this.renderList(this.getFilteredCustomers());
  }

  init() {
    // Initialized from app.js
  }
}

window.customersPage = new CustomersPage();
