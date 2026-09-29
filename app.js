'use strict';
const KEY = 'haitrieu-billing-v2', HISTORY_KEY = 'haitrieu-billing-history-v1', MAX_AMOUNT = 999999999, MAX_ROWS = 100;
const DEFAULT_ADDRESS = '432 Tân Phước, Phường Minh Phụng', DEFAULT_PHONE = '077985483';
const money = new Intl.NumberFormat('vi-VN'), $ = id => document.getElementById(id), format = value => money.format(value);
const printPage = document.createElement('style');
document.head.append(printPage);
const blank = () => ({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2), amount: '', name: '', note: '' });
let state = { rows: [blank()], address: DEFAULT_ADDRESS, phone: DEFAULT_PHONE, paper: '80', discount: '', bill: null }, history = [], previewMode = 'draft', toastTimer;
try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.rows) && saved.rows.length && saved.rows.length <= MAX_ROWS) {
        state.rows = saved.rows.map(row => ({ ...blank(), amount: /^\d{1,9}$/.test(String(row.amount)) ? String(Number(row.amount)) : '', name: typeof row.name === 'string' ? row.name.slice(0, 100) : '', note: typeof row.note === 'string' ? row.note.slice(0, 300) : '' }));
        state.address = typeof saved.address === 'string' && (saved.shopDefaultsApplied || saved.address.trim()) ? saved.address.slice(0, 180) : DEFAULT_ADDRESS;
        state.phone = typeof saved.phone === 'string' && (saved.shopDefaultsApplied || saved.phone.trim()) ? saved.phone.slice(0, 30) : DEFAULT_PHONE;
        state.paper = ['80', '58', 'a4'].includes(saved.paper) ? saved.paper : '80';
        state.discount = /^\d{1,11}$/.test(String(saved.discount)) && Number(saved.discount) <= MAX_AMOUNT * MAX_ROWS ? String(Number(saved.discount)) : '';
        if (saved.bill && typeof saved.bill.id === 'string' && Number.isFinite(Date.parse(saved.bill.date))) state.bill = saved.bill;
    }
} catch { }
const validBill = bill => bill && typeof bill.id === 'string' && bill.id.length <= 50 && Number.isFinite(Date.parse(bill.date)) && Array.isArray(bill.items) && bill.items.length > 0 && bill.items.length <= MAX_ROWS && bill.items.every(item => item && typeof item.name === 'string' && typeof item.note === 'string' && Number.isSafeInteger(item.amount) && item.amount >= 0 && item.amount <= MAX_AMOUNT) && Number.isSafeInteger(bill.subtotal) && bill.subtotal === bill.items.reduce((sum, item) => sum + item.amount, 0) && Number.isSafeInteger(bill.discount) && bill.discount >= 0 && bill.discount <= bill.subtotal && bill.total === bill.subtotal - bill.discount;
function readHistory(raw) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.filter(bill => {
        if (!validBill(bill) || seen.has(bill.id)) return false;
        seen.add(bill.id); return true;
    });
}
try { history = readHistory(localStorage.getItem(HISTORY_KEY)); } catch { }
function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, shopDefaultsApplied: true })); $('save-status').textContent = 'Đã lưu bản nháp trên thiết bị này.'; }
    catch { $('save-status').textContent = 'Không thể lưu bản nháp. Đừng đóng trang khi đang nhập.'; }
}
function notify(message, undo) {
    clearTimeout(toastTimer); const toast = $('toast'); toast.replaceChildren(document.createTextNode(message));
    if (undo) { const button = document.createElement('button'); button.textContent = 'Hoàn tác'; button.onclick = () => { undo(); toast.hidden = true; }; toast.append(button); }
    toast.hidden = false; toastTimer = setTimeout(() => toast.hidden = true, undo ? 10000 : 4500);
}
const billMonth = date => {
    const day = new Date(date);
    return day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0');
};
function renderHistory() {
    const bills = history.filter(bill => billMonth(bill.date) === $('history-month').value).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    $('history-total').textContent = format(bills.reduce((sum, bill) => sum + bill.total, 0)) + ' ₫';
    $('history-count').textContent = bills.length + ' bill đã lưu';
    $('print-month').disabled = bills.length === 0;
    const list = $('history-list'); list.replaceChildren();
    for (const bill of bills) {
        const item = document.createElement('div'), head = document.createElement('button'), label = document.createElement('span'), total = document.createElement('strong'), body = document.createElement('div');
        item.className = 'history-item'; body.className = 'history-details';
        head.type = 'button'; head.className = 'history-open'; head.setAttribute('aria-label', 'Xem bill ' + bill.id);
        label.textContent = new Date(bill.date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · ' + bill.id;
        total.textContent = format(bill.total) + ' ₫'; head.append(label, total); item.append(head);
        head.onclick = () => openSavedBill(bill);
        for (const service of bill.items) {
            const line = document.createElement('p');
            line.textContent = service.name + (service.note ? ' (' + service.note + ')' : '') + ': ' + format(service.amount) + ' ₫'; body.append(line);
        }
        if (bill.discount) {
            const line = document.createElement('p'); line.textContent = 'Tạm tính: ' + format(bill.subtotal) + ' ₫ · Giảm giá: ' + format(bill.discount) + ' ₫'; body.append(line);
        }
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'history-delete'; remove.textContent = 'Xóa bill này';
        remove.onclick = () => {
            if (!confirm('Xóa bill ' + bill.id + ' khỏi lịch sử? Doanh thu tháng sẽ được tính lại.')) return;
            const next = history.filter(saved => saved.id !== bill.id);
            try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); history = next; renderHistory(); notify('Đã xóa bill khỏi lịch sử.'); }
            catch { notify('Không thể cập nhật lịch sử bill trên thiết bị này.'); }
        };
        body.append(remove); item.append(body); list.append(item);
    }
}
function update() {
    const subtotal = state.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    if (Number(state.discount || 0) > subtotal) {
        state.discount = subtotal ? String(subtotal) : '';
        $('discount-input').value = state.discount ? format(subtotal) : '';
    }
    const discount = Number(state.discount || 0), total = subtotal - discount;
    const count = state.rows.filter(row => row.amount !== '').length;
    $('total-amount').textContent = $('summary-total').textContent = format(total) + ' ₫';
    $('summary-subtotal').textContent = format(subtotal) + ' ₫';
    $('summary-discount').textContent = '−' + format(discount) + ' ₫';
    $('summary-discount-line').hidden = discount === 0;
    $('total-label').textContent = 'Tổng cộng · ' + count + ' dịch vụ' + (discount ? ' · đã giảm ' + format(discount) + ' ₫' : ''); $('summary-count').textContent = count + ' dịch vụ'; $('service-count').textContent = state.rows.length + ' mục';
    $('add-service').disabled = state.rows.length >= MAX_ROWS;
    document.querySelectorAll('.service-card').forEach((card, index) => { card.querySelector('.number').innerHTML = '<b>' + String(index + 1).padStart(2, '0') + '</b> DỊCH VỤ'; card.querySelector('.remove').setAttribute('aria-label', 'Xóa dịch vụ ' + (index + 1)); });
    save(); return total;
}
function clearError(card) { card.querySelector('.error').textContent = ''; card.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid')); }
function createRow(row) {
    const card = document.createElement('section'); card.className = 'service-card'; card.dataset.id = row.id;
    card.innerHTML = '<div class="card-head"><span class="number"></span><button type="button" class="favorite-save">♡ Lưu mẫu</button><button type="button" class="remove">× Xóa</button></div>' +
        '<label for="price-' + row.id + '">Số tiền dịch vụ</label><div class="money-wrap"><input id="price-' + row.id + '" class="price-input" type="text" inputmode="numeric" enterkeyhint="next" autocomplete="off" placeholder="0" aria-describedby="help-' + row.id + ' error-' + row.id + '"><span>₫</span></div>' +
        '<p class="money-help" id="help-' + row.id + '">Nhập theo đồng · Ví dụ: 150000 → 150.000 ₫</p>' +
        '<div class="chips prices" aria-label="Chọn nhanh số tiền"><button class="chip" type="button" data-amount="50000">50.000</button><button class="chip" type="button" data-amount="100000">100.000</button><button class="chip" type="button" data-amount="150000">150.000</button><button class="chip" type="button" data-amount="200000">200.000</button></div>' +
        '<label for="name-' + row.id + '">Tên dịch vụ</label><input id="name-' + row.id + '" class="name-input" maxlength="100" placeholder="Ví dụ: Sơn gel tay" enterkeyhint="next" aria-describedby="error-' + row.id + '">' +
        '<div class="chips names" aria-label="Gợi ý tên dịch vụ"><button class="chip" type="button">Sơn gel tay</button><button class="chip" type="button">Sơn gel chân</button><button class="chip" type="button">Chăm sóc móng</button><button class="chip" type="button">Đắp bột</button></div>' +
        '<details class="note"><summary class="note-toggle">Ghi chú dịch vụ <span class="muted">(tùy chọn)</span></summary><label class="muted" for="note-' + row.id + '">Ghi chú này sẽ xuất hiện trên bill</label><textarea id="note-' + row.id + '" maxlength="300" placeholder="Ví dụ: Màu đỏ rượu, đính đá 2 ngón"></textarea></details><p class="error" id="error-' + row.id + '" role="alert"></p>';
    const price = card.querySelector('.price-input'), name = card.querySelector('.name-input'), note = card.querySelector('textarea');
    card.querySelector('.favorite-save').onclick = () => editFavorite(null, row);
    price.value = row.amount === '' ? '' : format(Number(row.amount)); name.value = row.name; note.value = row.note; card.querySelector('details').open = !!row.note;
    function setPrice(value) { row.amount = value; price.value = value === '' ? '' : format(Number(value)); clearError(card); update(); }
    price.addEventListener('input', () => {
        const raw = price.value, digitsBefore = raw.slice(0, price.selectionStart).replace(/\D/g, '').length;
        if (!/^\d*(?:\.\d*)*$/.test(raw) || Number(raw.replace(/\./g, '')) > MAX_AMOUNT) { price.value = row.amount === '' ? '' : format(Number(row.amount)); notify('Nhập số đồng nguyên từ 0 đến 999.999.999, không dùng dấu âm hoặc dấu phẩy.'); return; }
        const digits = raw.replace(/\D/g, ''); setPrice(digits === '' ? '' : String(Number(digits)));
        let position = 0, seen = 0; while (position < price.value.length && seen < digitsBefore) { if (/\d/.test(price.value[position])) seen++; position++; } price.setSelectionRange(position, position);
    });
    price.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); name.focus(); } });
    name.addEventListener('input', () => { row.name = name.value; clearError(card); update(); });
    note.addEventListener('input', () => { row.note = note.value; clearError(card); update(); });
    card.querySelectorAll('[data-amount]').forEach(button => button.onclick = () => { setPrice(button.dataset.amount); name.focus(); });
    card.querySelectorAll('.names button').forEach(button => button.onclick = () => { row.name = name.value = button.textContent; clearError(card); update(); if (row.amount === '') price.focus(); });
    card.querySelector('.remove').onclick = () => {
        const index = state.rows.indexOf(row); state.rows.splice(index, 1); let replacement;
        if (!state.rows.length) { replacement = blank(); state.rows.push(replacement); } render(); update();
        notify('Đã xóa dịch vụ.', () => { if (replacement) state.rows = state.rows.filter(item => item.id !== replacement.id || item.amount !== '' || item.name || item.note); if (state.rows.length >= MAX_ROWS) return; state.rows.splice(Math.min(index, state.rows.length), 0, row); render(); update(); });
    };
    return card;
}
function render() { $('service-list').replaceChildren(...state.rows.map(createRow)); }
$('add-service').onclick = () => { if (state.rows.length >= MAX_ROWS) return; const row = blank(); state.rows.push(row); const card = createRow(row); $('service-list').append(card); update(); card.querySelector('input').focus(); };
['address', 'phone'].forEach(key => { const input = $('shop-' + key); input.value = state[key]; input.addEventListener('input', () => { state[key] = input.value; save(); }); });
const discountInput = $('discount-input');
discountInput.value = state.discount ? format(Number(state.discount)) : '';
discountInput.addEventListener('input', () => {
    const raw = discountInput.value, digitsBefore = raw.slice(0, discountInput.selectionStart).replace(/\D/g, '').length;
    const subtotal = state.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const digits = raw.replace(/\D/g, '');
    if (!/^\d*(?:\.\d*)*$/.test(raw) || Number(digits) > subtotal) {
        discountInput.value = state.discount ? format(Number(state.discount)) : '';
        notify('Giảm giá phải là số đồng nguyên và không vượt quá tạm tính.'); return;
    }
    state.discount = digits === '' ? '' : String(Number(digits));
    discountInput.value = state.discount ? format(Number(state.discount)) : '';
    update();
    let position = 0, seen = 0;
    while (position < discountInput.value.length && seen < digitsBefore) { if (/\d/.test(discountInput.value[position])) seen++; position++; }
    discountInput.setSelectionRange(position, position);
});
function populateInvoice() {
    const active = state.rows.filter(row => row.amount !== '' || row.name.trim() || row.note.trim());
    if (!active.length) { notify('Thêm dịch vụ và số tiền để xem bill.'); $('service-list').querySelector('input').focus(); return false; }
    let firstInvalid;
    state.rows.forEach(row => {
        const card = document.querySelector('[data-id="' + row.id + '"]'); clearError(card); if (!active.includes(row)) return;
        const field = row.amount === '' ? '.price-input' : !row.name.trim() ? '.name-input' : null;
        if (field) { card.querySelector('.error').textContent = row.amount === '' ? 'Nhập số tiền cho dịch vụ này (nhập 0 nếu miễn phí).' : 'Nhập hoặc chọn tên dịch vụ để bill rõ ràng.'; card.querySelector(field).setAttribute('aria-invalid', 'true'); firstInvalid ||= card.querySelector(field); }
    });
    if (firstInvalid) { firstInvalid.focus(); return false; }
    if (!state.bill) { const now = new Date(); state.bill = { id: 'HT-' + now.getTime().toString(36).toUpperCase(), date: now.toISOString() }; }
    update(); renderReceipt(currentBill(), $('invoice-content')); return true;
}
function currentBill() {
    const items = state.rows.filter(row => row.amount !== '' || row.name.trim() || row.note.trim()).map(row => ({ name: row.name.trim(), note: row.note.trim(), amount: Number(row.amount) }));
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0), discount = Number(state.discount || 0);
    return { id: state.bill.id, date: state.bill.date, address: state.address.trim(), phone: state.phone.trim(), items, subtotal, discount, total: subtotal - discount };
}
function renderReceipt(bill, receipt) {
    const part = id => receipt.querySelector('#' + id);
    part('inv-id').textContent = bill.id;
    part('inv-datetime').textContent = new Date(bill.date).toLocaleString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const contact = [bill.address || '', bill.phone ? 'Đặt lịch: ' + bill.phone : ''].filter(Boolean).join('\n');
    part('inv-contact').textContent = contact; part('inv-contact').hidden = !contact;
    part('inv-items').replaceChildren(...bill.items.map(service => {
        const tr = document.createElement('tr'), description = document.createElement('td'), amount = document.createElement('td'), title = document.createElement('div');
        title.className = 'receipt-service'; title.textContent = service.name; description.append(title);
        if (service.note) { const note = document.createElement('div'); note.className = 'receipt-note'; note.textContent = service.note; description.append(note); }
        amount.textContent = format(service.amount); tr.append(description, amount); return tr;
    }));
    part('inv-subtotal-line').hidden = part('inv-discount-line').hidden = bill.discount === 0;
    part('inv-subtotal').textContent = format(bill.subtotal) + ' ₫'; part('inv-discount').textContent = '−' + format(bill.discount) + ' ₫';
    part('inv-total').textContent = format(bill.total) + ' ₫'; part('inv-count').textContent = bill.items.length + ' dịch vụ';
}
function configurePreview(mode) {
    previewMode = mode;
    $('invoice-screen').classList.toggle('month-mode', mode === 'month');
    $('invoice-content').hidden = mode === 'month'; $('month-receipts').hidden = mode !== 'month';
    $('save-invoice').hidden = mode !== 'draft'; $('edit-invoice').hidden = mode !== 'draft';
    $('print-invoice').textContent = mode === 'month' ? 'In tất cả bill' : mode === 'saved' ? 'In bill này' : 'Lưu & in';
    $('preview-title').textContent = mode === 'month' ? 'Bill trong tháng ' + $('history-month').value : mode === 'saved' ? 'Bill đã lưu' : 'Bản xem trước';
    $('preview-subtitle').textContent = mode === 'month' ? 'Kiểm tra danh sách và tổng doanh thu trước khi in' : mode === 'saved' ? 'Bản bill đã lưu trong lịch sử' : 'Kiểm tra dịch vụ và tổng tiền trước khi in';
    $('print-help').textContent = mode === 'month' ? 'In trên giấy A4, tỷ lệ 100% và tắt đầu/chân trang.' : 'Chọn khổ giấy tương ứng trong cửa sổ in, tỷ lệ 100% và tắt đầu/chân trang. Máy in nhiệt: chọn lề “Không”.';
    setPaper(); $('invoice-screen').showModal(); document.body.style.overflow = 'hidden';
}
document.querySelectorAll('.preview-trigger').forEach(button => button.onclick = () => { if (populateInvoice()) configurePreview('draft'); });
function openSavedBill(bill) { renderReceipt(bill, $('invoice-content')); configurePreview('saved'); }
$('print-month').onclick = () => {
    const bills = history.filter(bill => billMonth(bill.date) === $('history-month').value).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!bills.length) return;
    const heading = document.createElement('div'), title = document.createElement('h3'), total = document.createElement('p');
    heading.className = 'month-heading'; title.textContent = 'HẢI TRIỀU NAIL · BILL THÁNG ' + $('history-month').value;
    total.textContent = bills.length + ' bill · Tổng doanh thu: ' + format(bills.reduce((sum, bill) => sum + bill.total, 0)) + ' ₫';
    heading.append(title, total);
    const container = $('month-receipts'); container.replaceChildren(heading);
    for (const bill of bills) {
        const receipt = $('invoice-content').cloneNode(true);
        receipt.hidden = false;
        renderReceipt(bill, receipt);
        receipt.removeAttribute('id'); receipt.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        container.append(receipt);
    }
    configurePreview('month');
};
function closePreview() { $('invoice-screen').close(); }
$('close-preview').onclick = $('edit-invoice').onclick = closePreview;
$('invoice-screen').addEventListener('close', () => document.body.style.overflow = '');
function setPaper() {
    const width = state.paper === '58' ? 58 : 80;
    document.documentElement.style.setProperty('--receipt-width', width + 'mm'); document.documentElement.style.setProperty('--receipt-inner', (width - 8) + 'mm');
    printPage.textContent = previewMode === 'month' || state.paper === 'a4' ? '@page { size: A4; margin: 12mm; }' : '@page { size: auto; margin: 0; }'; save();
}
$('paper-size').value = state.paper; $('paper-size').onchange = event => { state.paper = event.target.value; setPaper(); };
function saveInvoice() {
    if (!populateInvoice()) return false;
    const existing = history.findIndex(saved => saved.id === state.bill.id);
    if (existing < 0) { state.bill.date = new Date().toISOString(); populateInvoice(); }
    const bill = currentBill();
    const next = history.slice();
    if (existing < 0) next.push(bill); else next[existing] = bill;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); history = next; $('history-month').value = billMonth(bill.date); renderHistory(); notify(existing < 0 ? 'Đã lưu bill vào lịch sử.' : 'Đã cập nhật bill trong lịch sử.'); return true; }
    catch { notify('Không thể lưu bill. Hãy kiểm tra dung lượng lưu trữ của trình duyệt.'); return false; }
}
$('save-invoice').onclick = saveInvoice;
document.querySelectorAll('.save-direct').forEach(button => button.onclick = saveInvoice);
$('print-invoice').onclick = () => { if (previewMode !== 'draft' || saveInvoice()) window.print(); };
window.addEventListener('beforeprint', () => { if (previewMode === 'draft') populateInvoice(); });
$('history-month').value = billMonth(new Date()); $('history-month').onchange = renderHistory;
window.addEventListener('storage', event => {
    if (event.key !== HISTORY_KEY) return;
    try { history = readHistory(event.newValue); renderHistory(); } catch { }
});
$('new-invoice').onclick = () => { if (state.rows.some(row => row.amount !== '' || row.name || row.note) && !confirm('Tạo hóa đơn mới? Bản nháp hiện tại sẽ được xóa.')) return; state.rows = [blank()]; state.discount = ''; discountInput.value = ''; state.bill = null; render(); update(); $('service-list').querySelector('input').focus(); notify('Đã tạo hóa đơn mới.'); };
// Each favorite is a reusable service; adding one always copies its values into the bill.
const FAVORITES_KEY = 'haitrieu-favorites-v1', MAX_FAVORITES = 100;
let favorites = [], editingFavorite = null;
try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    if (Array.isArray(saved)) favorites = saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim() && item.name.length <= 100 && typeof item.note === 'string' && item.note.length <= 300 && Number.isInteger(item.amount) && item.amount >= 0 && item.amount <= MAX_AMOUNT).slice(0, MAX_FAVORITES);
} catch { }
const searchText = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
function persistFavorites(next) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); favorites = next; renderFavorites(); return true; }
    catch { $('favorite-error').textContent = 'Không lưu được dịch vụ. Hãy kiểm tra dung lượng trình duyệt.'; notify('Không lưu được thay đổi dịch vụ yêu thích.'); return false; }
}
function editFavorite(id, source) {
    editingFavorite = id;
    $('favorite-name').value = source?.name || '';
    $('favorite-price').value = source?.amount ?? '';
    $('favorite-note').value = source?.note || '';
    $('favorite-submit').textContent = id ? 'Cập nhật dịch vụ' : 'Lưu dịch vụ';
    $('favorite-error').textContent = '';
    $('favorite-editor').open = true;
    $('favorite-name').focus();
}
function closeFavoriteEditor() {
    editingFavorite = null; $('favorite-form').reset(); $('favorite-error').textContent = '';
    $('favorite-submit').textContent = 'Lưu dịch vụ'; $('favorite-editor').open = false;
}
function addFavoriteToBill(service) {
    const empty = state.rows.find(row => row.amount === '' && !row.name.trim() && !row.note.trim());
    if (!empty && state.rows.length >= MAX_ROWS) { notify('Bill đã đủ 100 dịch vụ.'); return; }
    const row = empty || blank();
    Object.assign(row, { name: service.name, amount: String(service.amount), note: service.note });
    if (!empty) state.rows.push(row);
    render(); update();
    notify('Đã thêm ' + service.name + ' · ' + format(service.amount) + ' ₫ vào bill.');
}
function renderFavorites() {
    const query = searchText($('favorite-search').value);
    const matches = favorites.filter(service => searchText(service.name).includes(query));
    $('favorite-list').replaceChildren();
    $('favorite-empty').hidden = matches.length > 0;
    $('favorite-empty').textContent = favorites.length ? 'Không tìm thấy dịch vụ. Thử tên khác nhé.' : 'Lưu dịch vụ thường làm bên dưới, hoặc bấm “♡ Lưu mẫu” trên một dịch vụ đang nhập.';
    for (const service of matches) {
        const card = document.createElement('div'), pick = document.createElement('button'), name = document.createElement('strong'), price = document.createElement('span'), actions = document.createElement('div');
        card.className = 'favorite-card'; pick.className = 'favorite-pick'; pick.type = 'button';
        name.textContent = service.name; price.textContent = '+ ' + format(service.amount) + ' ₫';
        pick.setAttribute('aria-label', 'Thêm ' + service.name + ', ' + format(service.amount) + ' đồng vào bill');
        pick.append(name, price); pick.onclick = () => addFavoriteToBill(service);
        actions.className = 'favorite-actions';
        const edit = document.createElement('button'), remove = document.createElement('button');
        edit.type = remove.type = 'button'; edit.textContent = 'Sửa'; remove.textContent = 'Xóa';
        edit.setAttribute('aria-label', 'Sửa mẫu ' + service.name); remove.setAttribute('aria-label', 'Xóa mẫu ' + service.name);
        edit.onclick = () => editFavorite(service.id, service);
        remove.onclick = () => {
            if (!confirm('Xóa mẫu “' + service.name + '” khỏi dịch vụ yêu thích?')) return;
            if (persistFavorites(favorites.filter(item => item.id !== service.id))) {
                if (editingFavorite === service.id) closeFavoriteEditor();
                notify('Đã xóa mẫu dịch vụ.');
            }
        };
        actions.append(edit, remove); card.append(pick, actions); $('favorite-list').append(card);
    }
}
$('favorite-form').onsubmit = event => {
    event.preventDefault();
    const name = $('favorite-name').value.trim(), raw = $('favorite-price').value.trim();
    if (!name || !/^\d{1,9}$/.test(raw) || Number(raw) > MAX_AMOUNT) { $('favorite-error').textContent = 'Nhập tên dịch vụ và giá từ 0 đến 999.999.999 đồng.'; return; }
    if (!editingFavorite && favorites.length >= MAX_FAVORITES) { $('favorite-error').textContent = 'Đã đủ 100 mẫu. Hãy sửa hoặc xóa một mẫu cũ.'; return; }
    const service = { id: editingFavorite || blank().id, name, amount: Number(raw), note: $('favorite-note').value.trim() };
    const next = editingFavorite ? favorites.map(item => item.id === editingFavorite ? service : item) : [...favorites, service];
    if (persistFavorites(next)) { closeFavoriteEditor(); notify('Đã lưu dịch vụ yêu thích. Chạm vào thẻ để thêm vào bill.'); }
};
$('favorite-cancel').onclick = closeFavoriteEditor;
$('favorite-search').addEventListener('input', renderFavorites);
render(); update(); setPaper(); renderHistory(); renderFavorites();
