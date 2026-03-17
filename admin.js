/* ================================================================
   admin.js — Bazaar Admin Panel
   ================================================================ */

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let adminUser    = null;
let allProducts  = [];
let allOrders    = [];
let allBanners   = [];
let currentEditId = null;
let currentTab   = 'products';

// ----------------------------------------------------------------
// UTILITY
// ----------------------------------------------------------------
function showSpinner()  { document.getElementById('spinner').style.display='flex'; }
function hideSpinner()  { document.getElementById('spinner').style.display='none'; }

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.add('active');
}
function closeModal() {
  document.getElementById('modal').classList.remove('active');
  document.getElementById('modal-content').innerHTML = '';
  currentEditId = null;
}

function fmtCurrency(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

// ----------------------------------------------------------------
// AUTH
// ----------------------------------------------------------------

// Track whether the current login came from the admin login button.
// Only the explicit admin login flow grants admin access automatically.
let _adminLoginInProgress = false;

auth.onAuthStateChanged(async user => {
  if (user) {
    try {
      const docRef  = db.collection('users').doc(user.uid);
      const docSnap = await docRef.get();

      if (_adminLoginInProgress) {
        // Came from the admin login form — grant admin unconditionally.
        _adminLoginInProgress = false;
        const existingData = docSnap.exists ? docSnap.data() : {};
        await docRef.set(
          { email: user.email, displayName: existingData.displayName || user.email, isAdmin: true },
          { merge: true }
        );
        grantAdminAccess(user);
      } else if (docSnap.exists && docSnap.data().isAdmin) {
        // Already an admin from a previous session — let them straight in.
        grantAdminAccess(user);
      } else {
        // Logged in via shop or some other route — not an admin session.
        await auth.signOut();
      }
    } catch(e) {
      showAdminError('Could not verify credentials. Please try again.');
      await auth.signOut();
    }
  } else {
    adminUser = null;
    document.getElementById('view-admin-auth').classList.add('active');
    document.getElementById('view-admin-main').classList.remove('active');
  }
});

function grantAdminAccess(user) {
  adminUser = user;
  document.getElementById('view-admin-auth').classList.remove('active');
  document.getElementById('view-admin-main').classList.add('active');
  initAdminPanel();
}

async function doAdminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const pass  = document.getElementById('admin-password').value;
  if (!email || !pass) { showAdminError('Please enter your email and password.'); return; }

  const btn = document.getElementById('admin-login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  hideAdminError();

  try {
    _adminLoginInProgress = true;
    await auth.signInWithEmailAndPassword(email, pass);
    // onAuthStateChanged takes it from here.
  } catch(e) {
    _adminLoginInProgress = false;
    // Account doesn't exist yet — create it and grant admin access.
    if (e.code === 'auth/user-not-found') {
      try {
        _adminLoginInProgress = true;
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await db.collection('users').doc(cred.user.uid).set({
          email, displayName: email, isAdmin: true, createdAt: new Date()
        });
        grantAdminAccess(cred.user);
      } catch(err) {
        _adminLoginInProgress = false;
        showAdminError(authErrMsg(err.code));
        btn.disabled = false; btn.textContent = 'Sign In as Admin';
      }
    } else {
      showAdminError(authErrMsg(e.code));
      btn.disabled = false; btn.textContent = 'Sign In as Admin';
    }
  }
}

function showAdminError(msg) {
  const el = document.getElementById('admin-login-error');
  el.textContent = msg; el.style.display = 'block';
}
function hideAdminError() {
  document.getElementById('admin-login-error').style.display = 'none';
}

function authErrMsg(code) {
  const m = { 'auth/user-not-found':'No account found.','auth/wrong-password':'Wrong password.','auth/invalid-email':'Invalid email.' };
  return m[code] || 'Login failed.';
}

async function adminLogout() {
  await auth.signOut();
  toast('Logged out.');
}

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
async function initAdminPanel() {
  await Promise.all([loadAdminProducts(), loadAdminOrders(), loadAdminBanners(), loadSettings()]);
  updateStats();
}

// ----------------------------------------------------------------
// TAB SWITCHING
// ----------------------------------------------------------------
function switchAdminTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-' + tab)?.classList.add('active');
  document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
}

// ----------------------------------------------------------------
// STATS
// ----------------------------------------------------------------
function updateStats() {
  document.getElementById('stat-products').textContent = allProducts.length;
  document.getElementById('stat-orders').textContent   = allOrders.length;
  const revenue = allOrders.reduce((s,o) => s + (o.total||0), 0);
  document.getElementById('stat-revenue').textContent  = fmtCurrency(revenue);
  const activeBanners = allBanners.filter(b => b.active).length;
  document.getElementById('stat-banners').textContent  = activeBanners;
}

// ----------------------------------------------------------------
// PRODUCTS
// ----------------------------------------------------------------
async function loadAdminProducts() {
  try {
    let snap;
    try {
      snap = await db.collection('products').orderBy('name','asc').get();
    } catch(e) {
      snap = await db.collection('products').get();
    }
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allProducts.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    renderProductsTable();
  } catch(e) {
    document.getElementById('products-tbody').innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:24px">Error loading products: ${e.message}</td></tr>`;
  }
}

function renderProductsTable() {
  const tbody = document.getElementById('products-tbody');
  if (!allProducts.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px">No products yet. Add your first product!</td></tr>`;
    return;
  }
  tbody.innerHTML = allProducts.map(p => {
    const effectivePrice = p.discount > 0 ? Math.round(p.price * (1 - p.discount/100)) : p.price;
    return `
    <tr>
      <td><img class="table-product-img" src="${p.imageUrl || 'https://picsum.photos/seed/'+p.id+'/100/100'}" alt="${p.name}" /></td>
      <td><strong>${p.name}</strong><br><small style="color:var(--text3)">${(p.description||'').substring(0,50)}${p.description?.length>50?'…':''}</small></td>
      <td><span class="badge badge-info">${p.category || '—'}</span></td>
      <td>
        ${fmtCurrency(effectivePrice)}
        ${p.discount > 0 ? `<br><small style="color:var(--text3);text-decoration:line-through">${fmtCurrency(p.price)}</small>` : ''}
      </td>
      <td>
        ${p.discount > 0
          ? `<span class="badge badge-accent">${p.discount}% OFF</span>`
          : `<span style="color:var(--text3)">No discount</span>`}
      </td>
      <td>
        <span class="${p.stock <= 0 ? 'badge badge-danger' : p.stock < 5 ? 'badge badge-gold' : 'badge badge-success'}">
          ${p.stock <= 0 ? 'Out of stock' : p.stock + ' left'}
        </span>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openProductModal('${p.id}')">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="openDiscountModal('${p.id}')">🏷 Discount</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteProduct('${p.id}','${p.name}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openProductModal(productId = null) {
  currentEditId = productId;
  const p = productId ? allProducts.find(x => x.id === productId) : null;
  openModal(`
    <h3 class="modal-title">${p ? 'Edit Product' : 'Add New Product'}</h3>
    <div class="form-group">
      <label>Product Name *</label>
      <input type="text" id="p-name" placeholder="Product name" value="${p?.name||''}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category *</label>
        <input type="text" id="p-category" placeholder="e.g. Electronics, Clothing…" value="${p?.category||''}" />
      </div>
      <div class="form-group">
        <label>Price (₹) *</label>
        <input type="number" id="p-price" placeholder="0" min="0" value="${p?.price||''}" />
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="p-desc" placeholder="Product description…">${p?.description||''}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Stock Quantity *</label>
        <input type="number" id="p-stock" placeholder="0" min="0" value="${p?.stock||0}" />
      </div>
      <div class="form-group">
        <label>Discount (%)</label>
        <input type="number" id="p-discount" placeholder="0" min="0" max="90" value="${p?.discount||0}" />
      </div>
    </div>
    <div class="form-group">
      <label>Image URL</label>
      <input type="url" id="p-imageUrl" placeholder="https://…" value="${p?.imageUrl||''}"
        oninput="previewProductImage(this.value)" />
      <img id="p-img-preview" class="product-img-preview"
        src="${p?.imageUrl||'https://picsum.photos/seed/demo/64/64'}" alt="Preview" />
    </div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-primary btn-full" onclick="${p ? 'saveEditProduct()' : 'saveNewProduct()'}">
        ${p ? '💾 Save Changes' : '+ Add Product'}
      </button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function previewProductImage(url) {
  if (url) document.getElementById('p-img-preview').src = url;
}

async function saveNewProduct() {
  const data = collectProductForm();
  if (!data) return;
  showSpinner();
  try {
    await db.collection('products').add({ ...data, createdAt: new Date() });
    toast('Product added! ✅', 'success');
    closeModal();
    await loadAdminProducts();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

async function saveEditProduct() {
  const data = collectProductForm();
  if (!data || !currentEditId) return;
  showSpinner();
  try {
    await db.collection('products').doc(currentEditId).update({ ...data, updatedAt: new Date() });
    toast('Product updated! ✅', 'success');
    closeModal();
    await loadAdminProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

function collectProductForm() {
  const name     = document.getElementById('p-name').value.trim();
  const category = document.getElementById('p-category').value.trim();
  const price    = parseFloat(document.getElementById('p-price').value);
  const desc     = document.getElementById('p-desc').value.trim();
  const stock    = parseInt(document.getElementById('p-stock').value) || 0;
  const discount = Math.min(90, Math.max(0, parseInt(document.getElementById('p-discount').value) || 0));
  const imageUrl = document.getElementById('p-imageUrl').value.trim();

  if (!name)           { toast('Product name is required.', 'error'); return null; }
  if (!category)       { toast('Category is required.', 'error'); return null; }
  if (isNaN(price)||price<0) { toast('Enter a valid price.', 'error'); return null; }

  return { name, category, price, description: desc, stock, discount, imageUrl };
}

function openDiscountModal(productId) {
  currentEditId = productId;
  const p = allProducts.find(x => x.id === productId);
  openModal(`
    <h3 class="modal-title">🏷 Set Discount for "${p.name}"</h3>
    <p style="color:var(--text2);font-size:14px;margin-bottom:20px">
      Current price: ${fmtCurrency(p.price)} &nbsp; Current discount: ${p.discount||0}%
    </p>
    <div class="form-group">
      <label>New Discount (%): <strong id="disc-val">${p.discount||0}%</strong></label>
      <input type="range" id="disc-range" min="0" max="90" step="5" value="${p.discount||0}"
        oninput="document.getElementById('disc-val').textContent=this.value+'%'" />
      <div class="range-labels"><span>0%</span><span>45%</span><span>90%</span></div>
    </div>
    <p id="disc-preview" style="font-size:13px;color:var(--accent);margin-top:8px"></p>
    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-primary btn-full" onclick="applyProductDiscount()">Apply Discount</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
  document.getElementById('disc-range').addEventListener('input', function() {
    const pct = parseInt(this.value);
    const newPrice = pct > 0 ? Math.round(p.price * (1 - pct/100)) : p.price;
    document.getElementById('disc-preview').textContent =
      pct > 0 ? `New price: ${fmtCurrency(newPrice)} (save ${fmtCurrency(p.price - newPrice)})` : 'No discount applied.';
  });
}

async function applyProductDiscount() {
  const discount = parseInt(document.getElementById('disc-range').value) || 0;
  if (!currentEditId) return;
  showSpinner();
  try {
    await db.collection('products').doc(currentEditId).update({ discount });
    toast(`Discount of ${discount}% applied! ✅`, 'success');
    closeModal();
    await loadAdminProducts();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

function confirmDeleteProduct(id, name) {
  openModal(`
    <h3 class="modal-title">Delete Product?</h3>
    <p style="color:var(--text2);margin-bottom:24px">
      Are you sure you want to delete <strong style="color:var(--text1)">${name}</strong>?
      This action cannot be undone.
    </p>
    <div style="display:flex;gap:10px">
      <button class="btn btn-danger btn-full" onclick="deleteProduct('${id}')">Yes, Delete</button>
      <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function deleteProduct(id) {
  showSpinner();
  try {
    await db.collection('products').doc(id).delete();
    toast('Product deleted.', 'success');
    closeModal();
    await loadAdminProducts();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

function openAddSampleProductsModal() {
  openModal(`
    <h3 class="modal-title">📋 Add Sample Products</h3>
    <p style="color:var(--text2);font-size:14px;margin-bottom:20px">
      This will add 8 demo products to Firestore so you can see the shop in action.
    </p>
    <button class="btn btn-primary btn-full" onclick="addSampleProducts()">Add Sample Data</button>
  `);
}

async function addSampleProducts() {
  const samples = [
    { name:'Wireless Earbuds Pro', category:'Electronics', price:1999, description:'Premium sound quality with active noise cancellation and 30-hour battery life.',stock:50,discount:0,imageUrl:'https://picsum.photos/seed/earbuds/400/400'},
    { name:'Slim Fit Chinos', category:'Clothing', price:999, description:'Comfortable stretch-fabric chinos perfect for casual and semi-formal occasions.',stock:30,discount:10,imageUrl:'https://picsum.photos/seed/chinos/400/400'},
    { name:'Ceramic Mug Set', category:'Home & Kitchen', price:649, description:'Set of 4 hand-crafted ceramic mugs with a minimalist design.',stock:20,discount:0,imageUrl:'https://picsum.photos/seed/mugs/400/400'},
    { name:'Mechanical Keyboard', category:'Electronics', price:3499, description:'Tenkeyless compact layout with Cherry MX Brown switches and RGB backlight.',stock:15,discount:15,imageUrl:'https://picsum.photos/seed/keyboard/400/400'},
    { name:'Yoga Mat Premium', category:'Sports', price:799, description:'Extra-thick 6mm TPE yoga mat with alignment markings and carry strap.',stock:40,discount:0,imageUrl:'https://picsum.photos/seed/yogamat/400/400'},
    { name:'Stainless Water Bottle', category:'Sports', price:499, description:'Double-wall insulated bottle keeps drinks cold 24h and hot 12h.',stock:60,discount:5,imageUrl:'https://picsum.photos/seed/bottle/400/400'},
    { name:'LED Desk Lamp', category:'Home & Kitchen', price:1299, description:'Adjustable colour temperature and brightness with USB-C charging port.',stock:25,discount:0,imageUrl:'https://picsum.photos/seed/lamp/400/400'},
    { name:'Running Shoes', category:'Sports', price:2499, description:'Lightweight mesh upper with responsive foam cushioning for daily runs.',stock:8,discount:20,imageUrl:'https://picsum.photos/seed/shoes/400/400'},
  ];
  showSpinner();
  try {
    const batch = db.batch();
    samples.forEach(p => {
      const ref = db.collection('products').doc();
      batch.set(ref, { ...p, createdAt: new Date() });
    });
    await batch.commit();
    toast(`${samples.length} sample products added! ✅`, 'success');
    closeModal();
    await loadAdminProducts();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

// ----------------------------------------------------------------
// ORDERS
// ----------------------------------------------------------------
async function loadAdminOrders() {
  try {
    let snap;
    try {
      snap = await db.collection('orders').orderBy('createdAt','desc').get();
    } catch(indexErr) {
      // Firestore index not yet built — fall back to unordered fetch
      snap = await db.collection('orders').get();
    }
    allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort client-side by date descending as a safe fallback
    allOrders.sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return db_ - da;
    });
    renderOrdersTable(allOrders);
    loadAdminPayments();
  } catch(e) {
    document.getElementById('orders-tbody').innerHTML =
      `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:24px">Error loading orders: ${e.message}</td></tr>`;
  }
}

async function loadAdminPayments() {
  try {
    let snap;
    try {
      snap = await db.collection('payments').orderBy('createdAt','desc').get();
    } catch(e) {
      snap = await db.collection('payments').get();
    }
    const payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    payments.sort((a,b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const db_ = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return db_ - da;
    });
    renderPaymentsTable(payments);
  } catch(e) { /* payments collection may not exist yet */ }
}

function renderPaymentsTable(payments) {
  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;
  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:40px">No payments recorded yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = payments.map(p => {
    const method = p.method === 'card'
      ? `💳 Card ···${p.details?.last4 || '****'}`
      : `📱 ${p.details?.app || 'UPI'}`;
    return `
    <tr>
      <td><span style="font-family:'Fraunces',serif;color:var(--accent);font-size:13px">${p.orderId}</span></td>
      <td style="font-size:13px;color:var(--text2)">${fmtDate(p.createdAt)}</td>
      <td style="font-size:13px">${p.userEmail || '—'}</td>
      <td style="font-size:13px">${method}</td>
      <td><strong style="color:var(--success)">${fmtCurrency(p.amount)}</strong></td>
      <td><span class="badge badge-success">✅ Paid</span></td>
    </tr>`;
  }).join('');
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:40px">No orders yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const payMethod = o.paymentDetails?.method === 'card'
      ? `💳 Card ···${o.paymentDetails?.last4 || '****'}`
      : `📱 ${o.paymentDetails?.app || 'UPI'}`;
    const statusClass = { confirmed:'badge-success', pending:'badge-gold', shipped:'badge-info', delivered:'badge-success' }[o.status] || 'badge-info';
    return `
    <tr>
      <td><span style="font-family:'Fraunces',serif;color:var(--accent);font-size:13px">${o.orderId}</span></td>
      <td style="font-size:13px;color:var(--text2)">${fmtDate(o.createdAt)}</td>
      <td style="font-size:13px">${o.userEmail || o.address?.name || '—'}</td>
      <td style="font-size:13px">
        ${(o.items||[]).slice(0,2).map(i=>`${i.name} ×${i.quantity}`).join('<br>')}
        ${o.items?.length > 2 ? `<br><span style="color:var(--text3)">+${o.items.length-2} more</span>` : ''}
      </td>
      <td><strong style="color:var(--accent)">${fmtCurrency(o.total)}</strong></td>
      <td style="font-size:13px">${payMethod}</td>
      <td><span class="badge ${statusClass}">${o.status || 'confirmed'}</span></td>
      <td style="font-size:12px;color:var(--text2)">${o.eta || '—'}</td>
    </tr>`;
  }).join('');
}

function switchOrdersSubTab(tab) {
  const ordersDiv   = document.getElementById('subtab-orders');
  const paymentsDiv = document.getElementById('subtab-payments');
  const ordersBtn   = document.getElementById('subtab-orders-btn');
  const paymentsBtn = document.getElementById('subtab-payments-btn');
  if (tab === 'orders') {
    ordersDiv.style.display   = 'block';
    paymentsDiv.style.display = 'none';
    ordersBtn.style.borderBottomColor   = 'var(--accent)';
    ordersBtn.style.color               = 'var(--accent)';
    paymentsBtn.style.borderBottomColor = 'transparent';
    paymentsBtn.style.color             = 'var(--text2)';
  } else {
    ordersDiv.style.display   = 'none';
    paymentsDiv.style.display = 'block';
    paymentsBtn.style.borderBottomColor = 'var(--accent)';
    paymentsBtn.style.color             = 'var(--accent)';
    ordersBtn.style.borderBottomColor   = 'transparent';
    ordersBtn.style.color               = 'var(--text2)';
  }
}

function filterOrders(q) {
  const low = q.toLowerCase().trim();
  const filtered = allOrders.filter(o =>
    !low ||
    (o.orderId||'').toLowerCase().includes(low) ||
    (o.userEmail||'').toLowerCase().includes(low) ||
    (o.address?.name||'').toLowerCase().includes(low)
  );
  renderOrdersTable(filtered);
}

// ----------------------------------------------------------------
// BANNERS
// ----------------------------------------------------------------
async function loadAdminBanners() {
  try {
    let snap;
    try {
      snap = await db.collection('banners').orderBy('order','asc').get();
    } catch(e) {
      snap = await db.collection('banners').get();
    }
    allBanners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allBanners.sort((a,b) => (a.order||0) - (b.order||0));
    renderBannersTable();
    updateStats();
  } catch(e) {
    document.getElementById('banners-tbody').innerHTML =
      `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:40px">No banners yet.</td></tr>`;
  }
}

function renderBannersTable() {
  const tbody = document.getElementById('banners-tbody');
  if (!allBanners.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:40px">No banners yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allBanners.map(b => `
    <tr>
      <td><strong>${b.title||'—'}</strong></td>
      <td style="color:var(--text2)">${b.subtitle||'—'}</td>
      <td style="font-size:12px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.imageUrl||'—'}</td>
      <td>${b.order || 0}</td>
      <td>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
          <input type="checkbox" ${b.active?'checked':''} onchange="toggleBannerActive('${b.id}',this.checked)" />
          <span style="font-size:13px;color:${b.active?'var(--success)':'var(--text3)'}">${b.active?'Active':'Inactive'}</span>
        </label>
      </td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" onclick="openBannerModal('${b.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBanner('${b.id}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

function openBannerModal(bannerId = null) {
  currentEditId = bannerId;
  const b = bannerId ? allBanners.find(x => x.id === bannerId) : null;
  openModal(`
    <h3 class="modal-title">${b ? 'Edit Banner' : 'Add New Banner'}</h3>
    <div class="form-group">
      <label>Title *</label>
      <input type="text" id="b-title" placeholder="e.g. Weekend Sale!" value="${b?.title||''}" />
    </div>
    <div class="form-group">
      <label>Subtitle</label>
      <input type="text" id="b-subtitle" placeholder="e.g. Up to 50% off on selected items" value="${b?.subtitle||''}" />
    </div>
    <div class="form-group">
      <label>Image URL</label>
      <input type="url" id="b-imageUrl" placeholder="https://…" value="${b?.imageUrl||''}" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Display Order</label>
        <input type="number" id="b-order" placeholder="1" min="0" value="${b?.order||0}" />
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:4px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--text1)">
          <input type="checkbox" id="b-active" ${b?.active!==false?'checked':''} />
          <span>Active (shown on site)</span>
        </label>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-primary btn-full" onclick="${b ? 'saveEditBanner()' : 'saveNewBanner()'}">
        ${b ? '💾 Save Changes' : '+ Add Banner'}
      </button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveNewBanner() {
  const data = collectBannerForm();
  if (!data) return;
  showSpinner();
  try {
    await db.collection('banners').add({ ...data, createdAt: new Date() });
    toast('Banner added! ✅', 'success');
    closeModal();
    await loadAdminBanners();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

async function saveEditBanner() {
  const data = collectBannerForm();
  if (!data || !currentEditId) return;
  showSpinner();
  try {
    await db.collection('banners').doc(currentEditId).update(data);
    toast('Banner updated! ✅', 'success');
    closeModal();
    await loadAdminBanners();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

function collectBannerForm() {
  const title    = document.getElementById('b-title').value.trim();
  const subtitle = document.getElementById('b-subtitle').value.trim();
  const imageUrl = document.getElementById('b-imageUrl').value.trim();
  const order    = parseInt(document.getElementById('b-order').value) || 0;
  const active   = document.getElementById('b-active').checked;
  if (!title) { toast('Banner title is required.', 'error'); return null; }
  return { title, subtitle, imageUrl, order, active };
}

async function toggleBannerActive(id, active) {
  try {
    await db.collection('banners').doc(id).update({ active });
    const b = allBanners.find(x => x.id === id);
    if (b) b.active = active;
    toast(`Banner ${active ? 'activated' : 'deactivated'}.`, 'success');
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteBanner(id) {
  if (!confirm('Delete this banner?')) return;
  showSpinner();
  try {
    await db.collection('banners').doc(id).delete();
    toast('Banner deleted.', 'success');
    await loadAdminBanners();
    updateStats();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

// ----------------------------------------------------------------
// SETTINGS — MEGA DISCOUNT
// ----------------------------------------------------------------
async function loadSettings() {
  try {
    const doc = await db.collection('config').doc('global').get();
    if (doc.exists) {
      const d = doc.data();
      const disc = d.megaDiscount || 0;
      document.getElementById('mega-discount-range').value = disc;
      document.getElementById('mega-discount-val').textContent = disc + '%';
      document.getElementById('mega-discount-label').value = d.megaDiscountLabel || '';
    }
  } catch(e) { /* no settings yet */ }
}

async function saveMegaDiscount() {
  const disc  = parseInt(document.getElementById('mega-discount-range').value) || 0;
  const label = document.getElementById('mega-discount-label').value.trim();
  showSpinner();
  try {
    await db.collection('config').doc('global').set({ megaDiscount: disc, megaDiscountLabel: label }, { merge: true });
    toast(`Mega discount of ${disc}% saved! ✅`, 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}

async function clearMegaDiscount() {
  showSpinner();
  try {
    await db.collection('config').doc('global').set({ megaDiscount: 0, megaDiscountLabel: '' }, { merge: true });
    document.getElementById('mega-discount-range').value = 0;
    document.getElementById('mega-discount-val').textContent = '0%';
    document.getElementById('mega-discount-label').value = '';
    toast('Mega discount cleared.', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
  finally { hideSpinner(); }
}
