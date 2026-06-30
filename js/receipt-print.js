(function () {
  const params = new URLSearchParams(window.location.search);
  const receiptKey = params.get('receipt');
  let payload = null;

  try {
    payload = receiptKey ? JSON.parse(localStorage.getItem(receiptKey) || 'null') : null;
  } catch (err) {
    payload = null;
  }

  if (!payload || !payload.bill || !window.share) {
    document.body.innerHTML = '<p>Receipt data is not available. Please go back and open the receipt again.</p>';
    return;
  }

  const bill = payload.bill;
  const appUrl = payload.appUrl || './';

  window.BILL_DATA = bill;
  window.editBillInApp = function editBillInApp() {
    let opened = false;
    try {
      if (window.opener && !window.opener.closed && window.opener.billing && typeof window.opener.billing.setEditMode === 'function') {
        window.opener.billing.setEditMode(bill);
        if (window.opener.app && typeof window.opener.app.closeModal === 'function') {
          window.opener.app.closeModal('share-modal');
        }
        try { window.opener.focus(); } catch (e) {}
        opened = true;
      }
    } catch (e) {}

    if (!opened) {
      window.location.href = appUrl;
      return;
    }

    setTimeout(function () {
      try { window.close(); } catch (e) {}
    }, 120);
  };

  window.backToApp = function backToApp() {
    try { window.close(); } catch (e) {}
    setTimeout(function () {
      if (window.opener && !window.opener.closed) {
        try { window.opener.focus(); } catch (e) {}
      }
      if (!window.closed) {
        window.location.href = appUrl;
      }
    }, 120);
  };

  function fitReceiptToOnePage() {
    const receipt = document.querySelector('.receipt');
    if (!receipt) return;

    receipt.style.transform = '';
    receipt.style.marginBottom = '';

    const pxPerMm = 96 / 25.4;
    const receiptHeightMm = Math.max(120, Math.ceil((receipt.scrollHeight || receipt.offsetHeight) / pxPerMm) + 8);
    const pageHeightMm = Math.min(1000, receiptHeightMm);

    const style = document.createElement('style');
    style.textContent = `
      @media print {
        @page { size: 80mm ${pageHeightMm}mm; margin: 0; }
        html, body {
          width: 80mm !important;
          min-width: 80mm !important;
          max-width: 80mm !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #fff !important;
        }
        body {
          display: block !important;
        }
        .receipt {
          width: 80mm !important;
          max-width: 80mm !important;
          margin: 0 !important;
          padding: 2mm !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .receipt, .receipt * {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        tr, .meta, .totals, .foot {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  function waitForImages() {
    const images = Array.from(document.images || []);
    if (!images.length) return Promise.resolve();

    return Promise.race([
      Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);
  }

  const html = window.share.buildPrintHtml(bill, {
    showToolbar: true,
    appUrl
  });
  const parsed = new DOMParser().parseFromString(html, 'text/html');

  document.title = parsed.title || 'Receipt';
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  waitForImages().then(() => {
    fitReceiptToOnePage();
  });
}());





