class CollectionPage {
  constructor() {
    this.bills = [];
    this.logs = [];
    this.bound = false;
  }

  getQuery() {
    const input = document.getElementById('collection-search');
    return (input?.value || '').trim().toLowerCase();
  }

  toggleChequeDetails(billId) {
    const method = document.getElementById(`collect-method-${billId}`);
    const details = document.getElementById(`collect-cheque-details-${billId}`);
    const inlineCollect = document.querySelector(`[data-collect-inline-id="${billId}"]`);
    const chequeCollect = document.querySelector(`[data-collect-cheque-id="${billId}"]`);
    if (!method || !details) return;
    const isCheque = method.value === 'cheque';
    details.classList.toggle('hidden', !isCheque);
    inlineCollect?.classList.toggle('hidden', isCheque);
    chequeCollect?.classList.toggle('hidden', !isCheque);
  }

  getChequeDetails(billId, method) {
    if (method !== 'cheque') {
      return {
        chequeDate: '',
        chequeNumber: '',
        chequeBank: ''
      };
    }

    return {
      chequeDate: document.getElementById(`collect-cheque-date-${billId}`)?.value || '',
      chequeNumber: (document.getElementById(`collect-cheque-number-${billId}`)?.value || '').trim(),
      chequeBank: (document.getElementById(`collect-cheque-bank-${billId}`)?.value || '').trim()
    };
  }

  validateChequeDetails(details) {
    if (!details.chequeDate || !details.chequeNumber || !details.chequeBank) {
      alert('Please fill cheque date, cheque number, and bank.');
      return false;
    }
    return true;
  }

  confirmCollection({ amount, method }) {
    return new Promise((resolve) => {
      const existing = document.getElementById('collection-confirm-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'collection-confirm-modal';
      overlay.className = 'apple-confirm-overlay';
      overlay.innerHTML = `
        <div class="apple-confirm-card" role="dialog" aria-modal="true" aria-labelledby="collection-confirm-title">
          <h3 id="collection-confirm-title">Are you sure?</h3>
          <p>Collect LKR ${this.escapeHtml(amount.toLocaleString())} by ${this.escapeHtml(this.methodLabel(method))}.</p>
          <div class="apple-confirm-actions">
            <button type="button" class="apple-confirm-cancel">Cancel</button>
            <button type="button" class="apple-confirm-ok">Collect</button>
          </div>
        </div>
      `;

      const close = (value) => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 180);
        resolve(value);
      };

      overlay.querySelector('.apple-confirm-cancel')?.addEventListener('click', () => close(false));
      overlay.querySelector('.apple-confirm-ok')?.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          document.removeEventListener('keydown', onKeyDown);
          close(false);
        }
      };
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('active'));
      overlay.querySelector('.apple-confirm-ok')?.focus();
    });
  }

  confirmDeleteCollectionLog(log) {
    return new Promise((resolve) => {
      const existing = document.getElementById('collection-delete-confirm-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'collection-delete-confirm-modal';
      overlay.className = 'apple-confirm-overlay';
      overlay.innerHTML = `
        <div class="apple-confirm-card" role="dialog" aria-modal="true" aria-labelledby="collection-delete-confirm-title">
          <h3 id="collection-delete-confirm-title">Delete audit log?</h3>
          <p>This removes only this collection audit row. The bill balance and payment record will not be changed.</p>
          <div class="apple-confirm-actions">
            <button type="button" class="apple-confirm-cancel">Cancel</button>
            <button type="button" class="apple-confirm-ok apple-confirm-danger">Delete</button>
          </div>
        </div>
      `;

      const close = (value) => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 180);
        resolve(value);
      };

      overlay.querySelector('.apple-confirm-cancel')?.addEventListener('click', () => close(false));
      overlay.querySelector('.apple-confirm-ok')?.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('active'));
      overlay.querySelector('.apple-confirm-cancel')?.focus();
    });
  }

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  methodLabel(method) {
    const labels = {
      cash: 'Cash',
      card: 'Card',
      bank: 'Bank Transfer',
      cheque: 'Cheque',
      credit: 'Credit',
      multiple: 'Multiple'
    };
    return labels[String(method || '').toLowerCase()] || String(method || 'Payment');
  }

  getBillPayments(bill) {
    if (Array.isArray(bill?.payments) && bill.payments.length) return bill.payments;
    const method = String(bill?.paymentMethod || 'cash').toLowerCase();
    const amount = Money.clampZero(bill?.receivedAmount || 0);
    return Money.isPositive(amount) ? [{
      id: 'legacy-payment-1',
      method,
      amount,
      chequeDate: bill?.chequeDate || '',
      chequeNumber: bill?.chequeNumber || '',
      chequeBank: bill?.chequeBank || '',
      chequeStatus: method === 'cheque' ? (bill?.chequeStatus || 'pending') : ''
    }] : [];
  }

  createCollectionPayment(method, amount, chequeDetails = {}) {
    return {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      method,
      amount: Money.clampZero(amount),
      chequeDate: method === 'cheque' ? chequeDetails.chequeDate : '',
      chequeNumber: method === 'cheque' ? chequeDetails.chequeNumber : '',
      chequeBank: method === 'cheque' ? chequeDetails.chequeBank : '',
      chequeStatus: method === 'cheque' ? 'pending' : ''
    };
  }
  getDueBills() {
    const query = this.getQuery();
    return this.bills
      .filter((bill) => {
        if ((bill.billStatus || 'active') !== 'active') return false;

        const total = Money.round(bill.total);
        const received = Money.round(bill.receivedAmount || 0);
        const storedBalance = typeof bill.balanceAmount === 'number' ? Money.round(bill.balanceAmount) : null;
        const balance = storedBalance !== null ? Money.clampZero(storedBalance) : Money.clampZero(Money.subtract(total, received));
        if (!Money.isPositive(balance)) return false;
        if (!query) return true;
        return (bill.customerName || '').toLowerCase().includes(query);
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async collectPayment(billId) {
    const amountInput = document.getElementById(`collect-amount-${billId}`);
    const methodInput = document.getElementById(`collect-method-${billId}`);
    const amount = Money.clampZero(amountInput?.value || '0');
    const method = methodInput?.value || 'cash';
    const chequeDetails = this.getChequeDetails(billId, method);

    if (!Money.isPositive(amount)) {
      alert('Enter a valid collection amount.');
      return;
    }

    if (method === 'cheque' && !this.validateChequeDetails(chequeDetails)) return;

    const confirmed = await this.confirmCollection({ amount, method });
    if (!confirmed) return;

    const newPayment = this.createCollectionPayment(method, amount, chequeDetails);

    try {
      await window.db.collectBillPaymentAtomic({
        billId,
        amount,
        method,
        chequeDetails,
        payment: newPayment,
        auditLog: {
          action: 'collection_create',
          entity: 'bill',
          details: { amount, method }
        }
      });
    } catch (error) {
      alert(error?.message || 'Failed to collect payment. Please refresh and try again.');
      await this.render();
      return;
    }

    await this.render();
    if (window.historyView && window.app.currentPage === 'history') await window.historyView.render();
    if (window.customersPage && window.app.currentPage === 'customers') await window.customersPage.render();
    if (window.billing) {
      await window.billing.loadOutstandingDirectory();
      window.billing.renderOutstandingHint(document.getElementById('customer-name')?.value || '');
    }
  }

  print80mmBill(billId) {
    const bill = this.bills.find((item) => Number(item.id) === Number(billId));
    if (!bill) {
      alert('Bill is not available to print.');
      return;
    }
    if (!window.share) {
      alert('Print service is still loading. Please try again.');
      return;
    }

    window.share.currentBill = bill;
    window.share.printReceipt();
  }

  buildCollectionPrintHtml(log, bill = null) {
    const dateObj = log?.timestamp ? new Date(log.timestamp) : new Date();
    const dateStr = dateObj.toLocaleDateString();
    const timeStr = dateObj.toLocaleTimeString();
    const method = String(log?.method || '').toLowerCase();
    const amount = Money.round(log?.amount || 0);
    const beforeReceived = Money.round(log?.beforeReceived || 0);
    const afterReceived = Money.round(log?.afterReceived || beforeReceived + amount);
    const total = Money.round(bill?.total || 0);
    const balance = Money.clampZero(Money.subtract(total, afterReceived));
    const logoUrl = new URL('./icons/logo-print.png', window.location.href).href;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Collection Receipt</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 80mm; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 800; line-height: 1.25; color: #000; }
  .screen-actions {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #fff;
    padding: 10px;
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #ddd;
  }
  .screen-actions button {
    border: 1px solid #000;
    background: #fff;
    color: #000;
    padding: 8px 10px;
    font-size: 13px;
    border-radius: 8px;
  }
  .screen-actions .back-btn { background: #111; color: #fff; }
  .receipt { width: 80mm; margin: 0; padding: 2mm 2.5mm; }
  .receipt, .receipt * { font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
  .center { text-align: center; }
  .logo { display: block; width: 42mm; max-height: 22mm; margin: 0 auto 3px; object-fit: contain; }
  .business-name { font-size: 17px; line-height: 1.15; margin-bottom: 2px; }
  .title { margin: 7px 0; font-size: 18px; text-transform: uppercase; }
  .rule { border-top: 1px dashed #000; margin: 7px 0; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 4px 0; }
  .row span:last-child, .row strong:last-child { text-align: right; }
  .detail-row { grid-template-columns: 24mm minmax(0, 1fr); padding-left: 4mm; font-size: 14px; }
  .foot { margin-top: 10px; line-height: 1.35; font-size: 14px; }
  @media print {
    html, body, .receipt { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; }
    .screen-actions { display: none !important; }
  }
</style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print</button>
    <button class="back-btn" onclick="backToApp()">Back to App</button>
  </div>
  <div class="receipt">
    <div class="center">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
      <div class="business-name">SA Marketing</div>
      <div>Udagama - Kooratihena</div>
      <div>Ph.No: 071-5831829</div>
      <div>Reg No: 14/2453</div>
      <div class="title">Collection Receipt</div>
    </div>
    <div class="rule"></div>
    <div class="row"><span>Bill No</span><strong>#${this.escapeHtml(log?.billId || '-')}</strong></div>
    <div class="row"><span>Date</span><span>${this.escapeHtml(dateStr)} ${this.escapeHtml(timeStr)}</span></div>
    <div class="row"><span>Customer</span><span>${this.escapeHtml(log?.customerName || bill?.customerName || 'Customer')}</span></div>
    <div class="rule"></div>
    ${total ? `<div class="row"><span>Bill Total</span><strong>${total.toLocaleString()}</strong></div>` : ''}
    <div class="row"><span>Collected</span><strong>${amount.toLocaleString()}</strong></div>
    <div class="row"><span>Method</span><strong>${this.escapeHtml(this.methodLabel(method))}</strong></div>
    ${method === 'cheque' ? `
      <div class="row"><span>Cheque Amount</span><strong>${amount.toLocaleString()}</strong></div>
      <div class="row detail-row"><span>Cheque Date</span><span>${this.escapeHtml(log?.chequeDate || '-')}</span></div>
      <div class="row detail-row"><span>Cheque No</span><span>${this.escapeHtml(log?.chequeNumber || '-')}</span></div>
      <div class="row detail-row"><span>Bank</span><span>${this.escapeHtml(log?.chequeBank || '-')}</span></div>
    ` : ''}
    <div class="row"><span>Received Total</span><strong>${afterReceived.toLocaleString()}</strong></div>
    ${total ? `<div class="row"><span>Balance</span><strong>${balance.toLocaleString()}</strong></div>` : ''}
    <div class="rule"></div>
    <div class="foot">
      <div>Thank you for your payment.</div>
      <div>Powered by J&co.</div>
    </div>
  </div>
  <script>
    function backToApp() {
      try { window.close(); } catch (e) {}
      setTimeout(function () {
        if (window.opener && !window.opener.closed) {
          try { window.opener.focus(); } catch (e) {}
        }
      }, 120);
    }
  <\/script>
</body>
</html>`;
  }

  printCollectionLog(logId) {
    const log = this.logs.find((item) => Number(item.id) === Number(logId));
    if (!log) {
      alert('Collection record is not available to print.');
      return;
    }
    const bill = this.bills.find((item) => Number(item.id) === Number(log.billId)) || null;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocked. Please allow popups to print.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(this.buildCollectionPrintHtml(log, bill));
    printWindow.document.close();
  }

  async deleteCollectionLog(logId) {
    const log = this.logs.find((item) => Number(item.id) === Number(logId));
    if (!log) {
      alert('Collection audit log is not available.');
      return;
    }

    const confirmed = await this.confirmDeleteCollectionLog(log);
    if (!confirmed) return;

    const deleted = await window.db.deleteCollectionLog(logId);
    if (!deleted) {
      alert('Failed to delete collection audit log.');
      return;
    }

    this.logs = this.logs.filter((item) => Number(item.id) !== Number(logId));
    this.renderAuditTrail();
    if (window.reportsView && window.app.currentPage === 'reports') {
      await window.reportsView.render();
    }
  }

  renderList(bills) {
    const list = document.getElementById('collection-list');
    if (!list) return;

    if (bills.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">No pending collections.</div>';
      return;
    }

    list.innerHTML = '';
    bills.forEach((bill) => {
      const total = Money.round(bill.total);
      const received = Money.round(bill.receivedAmount || 0);
      const balance = typeof bill.balanceAmount === 'number'
        ? Money.clampZero(bill.balanceAmount)
        : Money.clampZero(Money.subtract(total, received));
      const dateStr = new Date(bill.timestamp).toLocaleString();

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="collect-card-header">
          <div class="collect-card-customer">${this.escapeHtml(bill.customerName || 'Walk-in Customer')}</div>
          <div class="collection-badge">Due LKR ${balance.toLocaleString()}</div>
        </div>
        <div class="collect-card-meta">${this.escapeHtml(dateStr)} | Bill #${this.escapeHtml(bill.id)}</div>
        <div class="collect-card-summary">
          <div><div class="collect-card-label">Total</div><div class="collect-card-value">${total.toLocaleString()}</div></div>
          <div><div class="collect-card-label">Received</div><div class="collect-card-value">${received.toLocaleString()}</div></div>
          <div><div class="collect-card-label">Balance</div><div class="collect-card-value collect-card-balance">${balance.toLocaleString()}</div></div>
        </div>
        <div class="collect-card-form">
          <div class="collect-card-fields">
            <div class="input-group collect-amount-group">
              <label>Collect Amount</label>
              <input type="number" id="collect-amount-${bill.id}" class="input-field" placeholder="0" step="0.01" maxlength="7">
            </div>
            <div class="input-group collect-method-group">
              <label>Method</label>
              <select id="collect-method-${bill.id}" class="input-field">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
          </div>
          <div class="collect-card-actions">
            <button class="btn-tool collect-print-btn" data-collection-print-id="${bill.id}">Print</button>
            <button class="btn-primary collect-submit-btn" data-collect-id="${bill.id}" data-collect-inline-id="${bill.id}">Collect</button>
          </div>
        </div>
        <div id="collect-cheque-details-${bill.id}" class="cheque-details hidden" style="margin-top:10px;">
          <div class="input-group">
            <label>Cheque Date</label>
            <input type="date" id="collect-cheque-date-${bill.id}" class="input-field">
          </div>
          <div class="input-group">
            <label>Cheque Number</label>
            <input type="text" id="collect-cheque-number-${bill.id}" class="input-field" placeholder="Enter cheque number">
          </div>
          <div class="input-group" style="margin-bottom:0;">
            <label>Bank</label>
            <input type="text" id="collect-cheque-bank-${bill.id}" class="input-field" placeholder="Enter bank name">
          </div>
          <button class="btn-primary collect-submit-btn collect-submit-btn-cheque hidden" data-collect-id="${bill.id}" data-collect-cheque-id="${bill.id}">Collect</button>
        </div>
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('[id^="collect-method-"]').forEach((select) => {
      select.addEventListener('change', () => {
        const billId = Number(select.id.replace('collect-method-', ''));
        this.toggleChequeDetails(billId);
      });
    });

    list.querySelectorAll('[data-collect-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const billId = Number(btn.getAttribute('data-collect-id'));
        await this.collectPayment(billId);
      });
    });

    list.querySelectorAll('[data-collection-print-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const billId = Number(btn.getAttribute('data-collection-print-id'));
        this.print80mmBill(billId);
      });
    });
  }

  renderAuditTrail() {
    const trail = document.getElementById('collection-audit-list');
    if (!trail) return;

    if (!this.logs.length) {
      trail.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted)">No collection activity yet.</div>';
      return;
    }

    trail.innerHTML = '';
    this.logs.slice(0, 30).forEach((log) => {
      const row = document.createElement('div');
      row.className = 'collection-log-row';
      const date = new Date(log.timestamp).toLocaleString();
      const action = log.action || 'collection';
      row.innerHTML = `
        <div class="collection-log-top">
          <div class="collection-log-main">
            <strong>${this.escapeHtml(log.customerName || 'Customer')}</strong> &bull; Bill #${this.escapeHtml(log.billId)}
          </div>
          <div class="collection-log-actions">
            <button type="button" class="collection-log-print-btn" data-collection-log-print-id="${this.escapeHtml(log.id)}">Print 80mm</button>
            <button type="button" class="collection-log-delete-btn" data-collection-log-delete-id="${this.escapeHtml(log.id)}" aria-label="Delete audit log" title="Delete audit log">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
                <path d="M6 7l1 14h10l1-14"></path>
                <path d="M9 7V4h6v3"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="collection-log-sub">
          ${this.escapeHtml(date)} &bull; ${this.escapeHtml(action)} &bull; ${this.escapeHtml(log.method || '-')} &bull; LKR ${(Number(log.amount) || 0).toLocaleString()}
        </div>
      `;
      trail.appendChild(row);
    });

    trail.querySelectorAll('[data-collection-log-print-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.printCollectionLog(btn.getAttribute('data-collection-log-print-id'));
      });
    });
    trail.querySelectorAll('[data-collection-log-delete-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.deleteCollectionLog(btn.getAttribute('data-collection-log-delete-id'));
      });
    });
  }

  bind() {
    if (this.bound) return;
    const search = document.getElementById('collection-search');
    search?.addEventListener('input', () => {
      this.renderList(this.getDueBills());
    });
    this.bound = true;
  }

  async render() {
    const list = document.getElementById('collection-list');
    if (list) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">Loading...</div>';
    }
    this.bind();
    const [bills, logs] = await Promise.all([window.db.getBills(), window.db.getCollectionLogs()]);
    this.bills = bills;
    this.logs = logs;
    this.renderList(this.getDueBills());
    this.renderAuditTrail();
  }

  init() {
    // Initialized from app.js
  }
}

window.collectionPage = new CollectionPage();



