if (!window.Money) {
  window.Money = (() => {
    const toCents = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.round((n + Number.EPSILON) * 100);
    };
    const fromCents = (cents) => {
      const n = Number(cents);
      if (!Number.isFinite(n)) return 0;
      return n / 100;
    };
    const round = (value) => fromCents(toCents(value));
    const add = (...values) => fromCents(values.reduce((sum, value) => sum + toCents(value), 0));
    const subtract = (left, right) => fromCents(toCents(left) - toCents(right));
    const multiply = (moneyValue, quantity) => round((Number(moneyValue) || 0) * (Number(quantity) || 0));
    const clampZero = (value) => fromCents(Math.max(0, toCents(value)));
    const isPositive = (value) => toCents(value) > 0;
    const isGreaterThan = (left, right) => toCents(left) > toCents(right);
    return { toCents, fromCents, round, add, subtract, multiply, clampZero, isPositive, isGreaterThan };
  })();
}

class ShareManager {
  constructor() {
    this.currentBill = null;
    this.businessName = 'SA Marketing';
    this.businessAddress = 'Udagama - Kooratihena';
    this.businessPhone = '071-5831829';
    this.businessRegNo = '14/2453';
  }

  formatCurrency(value) {
    const n = Money.round(value);
    return n.toLocaleString();
  }

  formatReceiptDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  isIOS() {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isAppleMobile || isIPadOS;
  }

  getReceiptStoreKey() {
    return `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  serializeForInlineScript(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  getPaymentMethod(bill) {
    return String(bill?.paymentMethod || (bill?.markAsCredit ? 'credit' : '')).trim().toLowerCase();
  }

  isChequeBill(bill) {
    return this.getPaymentMethod(bill) === 'cheque'
      || Boolean(bill?.chequeDate || bill?.chequeNumber || bill?.chequeBank);
  }

  getChequeAmount(bill) {
    if (!this.isChequeBill(bill)) return 0;
    const explicit = Money.clampZero(bill?.chequeAmount || 0);
    if (Money.isPositive(explicit)) return explicit;
    const received = Money.clampZero(bill?.receivedAmount || 0);
    if (Money.isPositive(received)) return received;
    return Money.clampZero(bill?.total || 0);
  }

  getPayments(bill) {
    if (Array.isArray(bill?.payments) && bill.payments.length) {
      return bill.payments.map((payment, index) => ({
        id: payment.id || `payment-${index + 1}`,
        method: String(payment.method || 'cash').toLowerCase(),
        amount: Money.clampZero(payment.chequeAmount || payment.amount),
        chequeAmount: Money.clampZero(payment.chequeAmount || payment.amount),
        chequeDate: payment.chequeDate || '',
        chequeNumber: payment.chequeNumber || '',
        chequeBank: payment.chequeBank || '',
        chequeStatus: payment.chequeStatus || ''
      }));
    }
    const method = this.getPaymentMethod(bill) || 'cash';
    return [{
      id: 'legacy-payment-1',
      method,
      amount: method === 'cheque' ? this.getChequeAmount(bill) : Money.clampZero(bill?.receivedAmount || 0),
      chequeAmount: method === 'cheque' ? this.getChequeAmount(bill) : 0,
      chequeDate: bill?.chequeDate || '',
      chequeNumber: bill?.chequeNumber || '',
      chequeBank: bill?.chequeBank || '',
      chequeStatus: bill?.chequeStatus || ''
    }];
  }

  methodLabel(method) {
    const labels = { cash: 'Cash', card: 'Card', bank: 'Bank Transfer', cheque: 'Cheque', credit: 'Credit', multiple: 'Multiple' };
    return labels[String(method || '').toLowerCase()] || String(method || 'Payment');
  }
  formatBillText() {
    const b = this.currentBill;
    if (!b) return '';

    let text = `*${this.businessName}*\n`;
    text += `${this.businessAddress}\n`;
    text += `${this.businessPhone}\n`;
    text += `Reg No: ${this.businessRegNo}\n`;
    text += `\n`;
    text += `Bill No: ${b.billNumber || b.id || '-'}\n`;
    text += `Date: ${b.date || new Date(b.timestamp).toLocaleDateString()}\n`;
    text += `Customer: ${b.customerName}\n`;
    if (b.customerPhone) text += `Phone: ${b.customerPhone}\n`;
    if (b.customerAddress) text += `Address: ${b.customerAddress}\n`;
    text += `--------------------\n`;
    b.items.forEach((i) => {
      const unit = i.unit ? ` ${i.unit}` : '';
      text += `${i.name} x${i.qty}${unit} @ LKR ${i.price}\n`;
      text += `  = LKR ${this.formatCurrency(Money.multiply(i.price, i.qty))}\n`;
    });
    const total = Money.round(b.total);
    const received = Money.round(b.receivedAmount || 0);
    const balance = typeof b.balanceAmount === 'number' ? Money.clampZero(b.balanceAmount) : Money.clampZero(Money.subtract(total, received));
    const billStatus = b.billStatus || 'active';
    const paymentMethod = this.getPaymentMethod(b);
    const change = Money.clampZero(b.changeAmount || Money.subtract(received, total));
    const paymentStatus = billStatus === 'active'
      ? (Money.isPositive(balance) ? 'due' : 'paid')
      : (b.paymentStatus || billStatus);
    text += `--------------------\n`;
    text += `*Total: LKR ${this.formatCurrency(b.total)}*\n`;
    text += `Received: LKR ${this.formatCurrency(received)}\n`;
    text += `Balance: LKR ${this.formatCurrency(balance)}\n`;
    if (Money.isPositive(change)) text += `Change: LKR ${this.formatCurrency(change)}\n`;
    const payments = this.getPayments(b).filter((payment) => Number(payment.amount) > 0);
    if (payments.length > 1 || paymentMethod === 'multiple') {
      text += `Payment Methods:\n`;
      let chequeIndex = 0;
      payments.forEach((payment) => {
        const label = payment.method === 'cheque' ? `Cheque ${++chequeIndex}` : this.methodLabel(payment.method);
        text += `${label}: LKR ${this.formatCurrency(payment.amount)}\n`;
        if (payment.method === 'cheque') {
          text += `  Date: ${payment.chequeDate || '-'}\n`;
          text += `  No: ${payment.chequeNumber || '-'}\n`;
          text += `  Bank: ${payment.chequeBank || '-'}\n`;
        }
      });
    } else if (paymentMethod) {
      text += `Method: ${this.methodLabel(paymentMethod)}\n`;
      if (this.isChequeBill(b)) {
        text += `Cheque Amount: LKR ${this.formatCurrency(this.getChequeAmount(b))}\n`;
        text += `Cheque Date: ${b.chequeDate || '-'}\n`;
        text += `Cheque No: ${b.chequeNumber || '-'}\n`;
        text += `Bank: ${b.chequeBank || '-'}\n`;
      }
    }
    text += `Status: ${paymentStatus}\n`;
    if (billStatus !== 'active') text += `Bill: ${billStatus}\n`;
    text += `\nThank you for your business!\n`;
    text += `Powered by J&co.`;
    return text;
  }

  buildPrintHtml(bill, options = {}) {
    const b = bill;
    const dateObj = b.timestamp ? new Date(b.timestamp) : new Date();
    const dateStr = this.formatReceiptDate(dateObj);
    const timeStr = dateObj.toLocaleTimeString();
    const invoiceNo = this.escapeHtml(b.billNumber || b.id || dateObj.getTime());
    const customer = this.escapeHtml(b.customerName || 'Walk-in Customer');
    const phone = this.escapeHtml(b.customerPhone || '');
    const address = this.escapeHtml(b.customerAddress || '');
    const logoUrl = new URL('./icons/logo-print.png', window.location.href).href;

    const itemsRows = b.items.map((item) => {
      const name = this.escapeHtml(item.name);
      const qty = Number(item.qty) || 0;
      const unit = item.unit ? ` ${this.escapeHtml(item.unit)}` : '';
      const price = Number(item.price) || 0;
      const amount = Money.multiply(price, qty);
      return `
      <div class="item-row">
        <div class="item-name">${name}</div>
        <div class="item-meta-line small">
          <span>Qty</span>
          <span>${qty}${unit}</span>
          <span>Price</span>
          <span>${this.formatCurrency(price)}</span>
        </div>
        <div class="item-line">
          <span>Amount</span>
          <strong>${this.formatCurrency(amount)}</strong>
        </div>
      </div>`;
    }).join('');

    const subTotal = Money.round(b.total);
    const received = Money.round(b.receivedAmount || 0);
    const balance = typeof b.balanceAmount === 'number' ? Money.clampZero(b.balanceAmount) : Money.clampZero(Money.subtract(subTotal, received));
    const change = Money.clampZero(b.changeAmount || Money.subtract(received, subTotal));
    const billStatus = b.billStatus || 'active';
    const paymentMethod = this.getPaymentMethod(b);
    const paymentStatus = billStatus === 'active'
      ? (Money.isPositive(balance) ? 'due' : 'paid')
      : (b.paymentStatus || billStatus);
    const payments = this.getPayments(b).filter((payment) => Number(payment.amount) > 0);
    const hasChequePayment = this.isChequeBill(b) || payments.some((payment) => payment.method === 'cheque');
    const paymentLabel = paymentMethod ? this.methodLabel(paymentMethod) : '-';
    const paymentRows = payments.length > 1 || paymentMethod === 'multiple'
      ? `
      <div class="row payment-heading"><span>Payment Methods</span><span></span></div>
      ${(() => {
        let chequeIndex = 0;
        return payments.map((payment) => {
          const label = payment.method === 'cheque' ? `Cheque ${++chequeIndex}` : this.methodLabel(payment.method);
          return `
          <div class="payment-block">
          <div class="row"><span>${this.escapeHtml(label)}</span><span>${this.formatCurrency(payment.amount)}</span></div>
          ${payment.method === 'cheque' ? `
            <div class="row detail-row small"><span>Chq Date</span><span>${this.escapeHtml(payment.chequeDate || '-')}</span></div>
            <div class="row detail-row small"><span>Chq No</span><span>${this.escapeHtml(payment.chequeNumber || '-')}</span></div>
            <div class="row detail-row small"><span>Bank</span><span>${this.escapeHtml(payment.chequeBank || '-')}</span></div>` : ''}
          </div>
        `;
        }).join('');
      })()}`
      : '';
    const chequeAmount = this.getChequeAmount(b);
    const chequeRows = !paymentRows && this.isChequeBill(b)
      ? `
      <div class="payment-block">
      <div class="row"><span>Cheque Amount</span><span>${this.formatCurrency(chequeAmount)}</span></div>
      <div class="row detail-row small"><span>Cheque Date</span><span>${this.escapeHtml(b.chequeDate || '-')}</span></div>
      <div class="row detail-row small"><span>Cheque No</span><span>${this.escapeHtml(b.chequeNumber || '-')}</span></div>
      <div class="row detail-row small"><span>Bank</span><span>${this.escapeHtml(b.chequeBank || '-')}</span></div>
      </div>`
      : '';
    const showToolbar = Boolean(options.showToolbar);
    const appUrl = this.escapeHtml(options.appUrl || window.location.href);
    const billPayload = this.serializeForInlineScript(b);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: 80mm; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 800; line-height: 1.25; color: #000; }
  body.print-mode { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt { width: 80mm; margin: 0; padding: 2mm 2.5mm; }
  .receipt, .receipt * { font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
  .center { text-align: center; }
  .header { padding-top: 1mm; }
  .logo { display: block; width: 42mm; max-height: 22mm; margin: 0 auto 3px; object-fit: contain; }
  .business-name { font-size: 17px; line-height: 1.15; margin-bottom: 2px; }
  .header-line { line-height: 1.15; }
  .title { font-weight: 700; margin: 5px 0; }
  .rule { border-top: 1px dashed #000; margin: 7px 0; }
  .meta { display: grid; grid-template-columns: 22mm minmax(0, 1fr); gap: 4px 8px; }
  .meta div:nth-child(even) { text-align: right; }
  .items-head {
    border-bottom: 1px dashed #000;
    padding: 2px 0 4px;
    margin-bottom: 5px;
    font-size: 18px;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .item-row { padding: 5px 0; border-bottom: 1px dotted #888; }
  .item-row:last-child { border-bottom: 0; }
  .item-name { margin-bottom: 3px; }
  .item-meta-line { display: grid; grid-template-columns: auto 1fr auto auto; gap: 6px; margin-bottom: 2px; }
  .item-meta-line span:nth-child(2),
  .item-meta-line span:nth-child(4) { text-align: right; white-space: nowrap; }
  .item-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .item-line strong { text-align: right; white-space: nowrap; }
  .totals { margin-top: 6px; }
  .totals .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 3px 0; }
  .totals .row span:last-child, .totals .row strong:last-child { text-align: right; }
  .payment-heading {
    padding-top: 7px !important;
    padding-bottom: 7px !important;
    font-size: 18px;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .payment-block { padding: 8px 0 6px; }
  .payment-block + .payment-block { border-top: 1px dashed #888; margin-top: 6px; padding-top: 10px; }
  .payment-block .row:first-child { padding-bottom: 3px; }
  .detail-row { grid-template-columns: 24mm minmax(0, 1fr) !important; padding: 4px 0 4px 4mm !important; }
  .foot { margin-top: 10px; line-height: 1.35; }
  .small { font-size: 14px; font-weight: 800; }
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
  .screen-actions .back-btn {
    background: #111;
    color: #fff;
  }
  @media print {
    html, body {
      width: 80mm !important;
      min-width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: visible !important;
    }
    body {
      display: block !important;
    }
    .receipt {
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 !important;
      padding: 2mm 2.5mm !important;
    }
    .screen-actions { display: none !important; }
  }
</style>
</head>
<body class="print-mode">
  ${showToolbar ? `<div class="screen-actions">
    <button onclick="window.print()">Print</button>
    <button onclick="editBillInApp()">Edit Bill</button>
    <button class="back-btn" onclick="backToApp()">Back to App</button>
  </div>` : ''}
  <div class="receipt">
    <div class="center header">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
      <div class="business-name"><strong>${this.escapeHtml(this.businessName)}</strong></div>
      <div class="header-line">${this.escapeHtml(this.businessAddress)}</div>
      <div class="header-line">Ph.No: ${this.escapeHtml(this.businessPhone)}</div>
      <div class="header-line">Reg No: ${this.escapeHtml(this.businessRegNo)}</div>
    </div>

    <div class="rule"></div>

    <div class="meta">
      <div>Bill No:</div><div>${invoiceNo}</div>
      <div>Date:</div><div>${this.escapeHtml(dateStr)} ${this.escapeHtml(timeStr)}</div>
      <div>Bill To:</div><div>${customer}</div>
      ${phone ? `<div>Phone:</div><div>${phone}</div>` : ''}
      ${address ? `<div>Address:</div><div>${address}</div>` : ''}
    </div>

    <div class="rule"></div>

    <div class="items">
      <div class="items-head">Items</div>
      ${itemsRows}
    </div>

    <div class="rule"></div>

    <div class="totals">
      <div class="row"><span>Sub Total</span><strong>${this.formatCurrency(subTotal)}</strong></div>
      <div class="row"><span>Total</span><strong>${this.formatCurrency(subTotal)}</strong></div>
      ${hasChequePayment ? '' : `<div class="row"><span>Received</span><span>${this.formatCurrency(received)}</span></div>`}
      <div class="row"><span>Balance</span><strong>${this.formatCurrency(balance)}</strong></div>
      ${Money.isPositive(change) ? `<div class="row"><span>Change</span><span>${this.formatCurrency(change)}</span></div>` : ''}
      ${paymentRows}
      ${paymentRows ? '' : `<div class="row"><span>Payment Method</span><span>${this.escapeHtml(paymentLabel)}</span></div>`}
      ${hasChequePayment ? '' : `<div class="row"><span>Payment Status</span><span>${this.escapeHtml(paymentStatus)}</span></div>`}
      ${billStatus !== 'active' ? `<div class="row"><span>Bill Status</span><span>${this.escapeHtml(billStatus)}</span></div>` : ''}
      ${chequeRows}
    </div>

    <div class="rule"></div>

    <div class="foot small">
      <div>Terms & Conditions</div>
      <div>Thank you for doing business with us.</div>
      <div>Powered by J&co.</div>
    </div>
  </div>
  <script>
    const BILL_DATA = ${billPayload};

    function editBillInApp() {
      let opened = false;
      try {
        if (window.opener && !window.opener.closed && window.opener.billing && typeof window.opener.billing.setEditMode === 'function') {
          window.opener.billing.setEditMode(BILL_DATA);
          if (window.opener.app && typeof window.opener.app.closeModal === 'function') {
            window.opener.app.closeModal('share-modal');
          }
          try { window.opener.focus(); } catch (e) {}
          opened = true;
        }
      } catch (e) {}

      if (!opened) {
        window.location.href = '${appUrl}';
        return;
      }

      setTimeout(function () {
        try { window.close(); } catch (e) {}
      }, 120);
    }

    function backToApp() {
      try { window.close(); } catch (e) {}
      setTimeout(function () {
        if (window.opener && !window.opener.closed) {
          try { window.opener.focus(); } catch (e) {}
        }
        if (!window.closed) {
          window.location.href = '${appUrl}';
        }
      }, 120);
    }
  </script>
</body>
</html>`;
  }

  printReceipt() {
    const b = this.currentBill;
    if (!b) {
      alert('No bill selected to print.');
      return;
    }

    // Purge all previous receipt keys to prevent localStorage from filling up.
    Object.keys(localStorage)
      .filter((k) => k.startsWith('receipt-'))
      .forEach((k) => localStorage.removeItem(k));

    const receiptKey = this.getReceiptStoreKey();
    try {
      localStorage.setItem(receiptKey, JSON.stringify({
        bill: b,
        appUrl: window.location.href
      }));
    } catch (err) {
      alert('Unable to prepare receipt. Please free browser storage and try again.');
      return;
    }

    const printWindow = window.open(`receipt-print.html?receipt=${encodeURIComponent(receiptKey)}`, '_blank');
    if (!printWindow) {
      alert('Popup blocked. Please allow popups to print.');
    }
  }

  buildCollectingOrderPrintHtml(order) {
    const o = order || {};
    const dateObj = o.timestamp ? new Date(o.timestamp) : new Date();
    const dateStr = dateObj.toLocaleDateString();
    const timeStr = dateObj.toLocaleTimeString();
    const orderNo = this.escapeHtml(o.orderNumber || o.id || dateObj.getTime());
    const customer = this.escapeHtml(o.customerName || 'Walk-in Customer');
    const phone = this.escapeHtml(o.customerPhone || '');
    const address = this.escapeHtml(o.customerAddress || '');
    const logoUrl = new URL('./icons/logo-print.png', window.location.href).href;
    const itemsRows = (o.items || []).map((item) => `
      <div class="item-row">
        <div class="item-name">${this.escapeHtml(item.name || '')}</div>
        <div class="item-line">
          <span>Qty</span>
          <strong>${this.escapeHtml(this.formatQtyLine(item.qty, item.unit))}</strong>
        </div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Collecting Order</title>
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
  .screen-actions .back-btn {
    background: #111;
    color: #fff;
  }
  .sheet { width: 80mm; margin: 0; padding: 2mm 2.5mm; }
  .sheet, .sheet * { font-weight: 800; overflow-wrap: anywhere; word-break: break-word; }
  .center { text-align: center; }
  .logo { display: block; width: 42mm; max-height: 22mm; margin: 0 auto 3px; object-fit: contain; }
  .business-name { font-size: 17px; line-height: 1.15; margin-bottom: 2px; }
  .header-line { line-height: 1.15; }
  .rule { border-top: 1px dashed #000; margin: 7px 0; }
  .meta { display: grid; grid-template-columns: 24mm minmax(0, 1fr); gap: 4px 8px; }
  .meta div:nth-child(even) { text-align: right; }
  .section-title {
    margin: 5px 0;
    font-size: 18px;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .item-row { padding: 6px 0; border-bottom: 1px dotted #888; }
  .item-row:last-child { border-bottom: 0; }
  .item-name { margin-bottom: 3px; }
  .item-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .foot { margin-top: 10px; line-height: 1.35; }
  @media print {
    .screen-actions { display: none !important; }
    html, body, .sheet { width: 80mm !important; max-width: 80mm !important; }
  }
</style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Print</button>
    <button class="back-btn" onclick="backToApp()">Back to App</button>
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
  <div class="sheet">
    <div class="center">
      <img class="logo" src="${logoUrl}" alt="logo" onerror="this.style.display='none'">
      <div class="business-name"><strong>${this.escapeHtml(this.businessName)}</strong></div>
      <div class="header-line">${this.escapeHtml(this.businessAddress)}</div>
      <div class="header-line">Ph.No: ${this.escapeHtml(this.businessPhone)}</div>
      <div class="header-line">Reg No: ${this.escapeHtml(this.businessRegNo)}</div>
    </div>

    <div class="rule"></div>

    <div class="center"><strong>Collecting Order</strong></div>

    <div class="rule"></div>

    <div class="meta">
      <div>Order No:</div><div>${orderNo}</div>
      <div>Date:</div><div>${this.escapeHtml(dateStr)} ${this.escapeHtml(timeStr)}</div>
      <div>Customer:</div><div>${customer}</div>
      ${phone ? `<div>Phone:</div><div>${phone}</div>` : ''}
      ${address ? `<div>Address:</div><div>${address}</div>` : ''}
    </div>

    <div class="rule"></div>
    <div class="section-title">Items</div>
    ${itemsRows || '<div>No items</div>'}

    <div class="rule"></div>
    <div class="foot">
      <div>Powered by J&co.</div>
    </div>
  </div>
</body>
</html>`;
  }

  formatQtyLine(qty, unit) {
    const quantity = Number(qty) || 0;
    return `${quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ` ${String(unit).trim()}` : ''}`;
  }

  printCollectingOrder(order, printWindow = null) {
    if (!order) {
      alert('No collecting order selected to print.');
      return;
    }

    const targetWindow = printWindow || window.open('', '_blank');
    if (!targetWindow) {
      alert('Popup blocked. Please allow popups to print.');
      return;
    }
    targetWindow.document.open();
    targetWindow.document.write(this.buildCollectingOrderPrintHtml(order));
    targetWindow.document.close();
  }

  viaWhatsApp() {
    const text = encodeURIComponent(this.formatBillText());
    if (this.currentBill && this.currentBill.customerPhone) {
      let phone = this.currentBill.customerPhone.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '94' + phone.substring(1);
      window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  }

  viaSMS() {
    const text = encodeURIComponent(this.formatBillText());
    const phone = this.currentBill?.customerPhone || '';
    // Use a hidden anchor click so the browser hands the sms: URI to
    // the OS without navigating the current tab away from the app.
    const a = document.createElement('a');
    a.href = `sms:${phone}?body=${text}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async copyText() {
    const text = this.formatBillText();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        alert('Bill text copied to clipboard!');
      } else {
        alert('Clipboard API not available');
      }
    } catch (e) {
      alert('Failed to copy');
    }
  }
}

window.share = new ShareManager();










