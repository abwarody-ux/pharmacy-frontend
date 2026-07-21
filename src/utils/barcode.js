import JsBarcode from 'jsbarcode';

export function printBarcodeLabel(product) {
  if (!product.barcode) return;
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, product.barcode, {
    format: 'CODE128',
    width: 2,
    height: 60,
    displayValue: true,
    fontSize: 14,
  });
  const dataUrl = canvas.toDataURL('image/png');

  const win = window.open('', '_blank', 'width=400,height=320');
  if (!win) return;
  win.document.write(`
    <html>
      <head><title>Etiquette - ${product.name}</title></head>
      <body style="text-align:center;font-family:sans-serif;padding:24px;">
        <div style="font-weight:bold;margin-bottom:10px;">${product.name}</div>
        <img src="${dataUrl}" />
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}