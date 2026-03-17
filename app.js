/* ================================================================
   app.js — Bazaar E-Commerce App (User Side)
   ================================================================ */

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let currentUser    = null;
let products       = [];          // All products from Firestore
let filteredProds  = [];          // After search / category filter
let activeCategory = 'all';
let currentProductId = null;
let cart           = loadCartFromStorage();
let selectedAddressId = null;
let addresses      = [];
let paymentMethod  = 'card';
let orderTotal     = 0;
let bannerIndex    = 0;
let bannerCount    = 0;
let bannerInterval = null;
let globalDiscount = 0;           // Mega discount %

// ----------------------------------------------------------------
// UTILITY HELPERS
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
}

function fmtCurrency(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function generateOrderId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return 'ORD-' + ts + rand;
}

function calcETA() {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  return d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function loadCartFromStorage() {
  try { return JSON.parse(localStorage.getItem('bazaar_cart')) || []; }
  catch { return []; }
}
function saveCartToStorage() {
  localStorage.setItem('bazaar_cart', JSON.stringify(cart));
}

// ----------------------------------------------------------------
// VIEW MANAGEMENT
// ----------------------------------------------------------------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);

  // Refresh views on show
  if (name === 'cart')     renderCart();
  if (name === 'shop')     { loadProducts(); }
  if (name === 'checkout') renderCheckoutSummary();

  // Highlight active nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navMap = { shop:'nav-shop', cart:'nav-cart' };
  if (navMap[name]) document.getElementById(navMap[name])?.classList.add('active');
}

// ----------------------------------------------------------------
// AUTH
// ----------------------------------------------------------------
auth.onAuthStateChanged(async user => {
  if (user) {
    // If this is an admin account, redirect straight to the admin portal.
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists && doc.data().isAdmin) {
        window.location.href = 'admin.html';
        return;
      }
    } catch(e) { /* non-critical — fall through to normal shop */ }

    currentUser = user;
    document.getElementById('navbar').classList.add('show');
    showView('shop');
    updateCartBadge();
    loadGlobalSettings();
    loadBanners();
  } else {
    currentUser = null;
    document.getElementById('navbar').classList.remove('show');
    showView('auth');
  }
});

function toggleAuthPanel(panel) {
  if (panel === 'register') {
    document.getElementById('login-panel').style.display    = 'none';
    document.getElementById('register-panel').style.display = 'block';
  } else {
    document.getElementById('login-panel').style.display    = 'block';
    document.getElementById('register-panel').style.display = 'none';
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) { toast('Please fill in all fields.', 'error'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    toast('Welcome back! 👋', 'success');
  } catch(e) {
    toast(firebaseErrMsg(e.code), 'error');
  } finally { btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  if (!name || !email || !pass) { toast('Please fill in all fields.', 'error'); return; }
  if (pass.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
  const btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({ email, displayName: name, isAdmin: false, createdAt: new Date() });
    toast('Account created! Welcome 🎉', 'success');
  } catch(e) {
    toast(firebaseErrMsg(e.code), 'error');
  } finally { btn.disabled = false; btn.textContent = 'Create Account'; }
}

async function handleLogout() {
  await auth.signOut();
  toast('Logged out. See you soon!');
}

function firebaseErrMsg(code) {
  const map = {
    'auth/user-not-found':    'No account found with that email.',
    'auth/wrong-password':    'Incorrect password.',
    'auth/email-already-in-use': 'Email already registered.',
    'auth/invalid-email':     'Invalid email address.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/weak-password':     'Password is too weak.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ----------------------------------------------------------------
// GLOBAL SETTINGS (mega discount)
// ----------------------------------------------------------------
async function loadGlobalSettings() {
  try {
    const doc = await db.collection('config').doc('global').get();
    if (doc.exists) {
      const d = doc.data();
      globalDiscount = d.megaDiscount || 0;
      if (globalDiscount > 0) {
        document.getElementById('mega-banner').style.display = 'flex';
        document.getElementById('mega-banner-title').textContent =
          (d.megaDiscountLabel || 'MEGA OFFER') + ' — ' + globalDiscount + '% OFF';
        document.getElementById('mega-banner-sub').textContent =
          'Discount automatically applied on all products!';
      } else {
        document.getElementById('mega-banner').style.display = 'none';
      }
    }
  } catch(e) { /* silently ignore */ }
}

// ----------------------------------------------------------------
// BANNERS
// ----------------------------------------------------------------
async function loadBanners() {
  try {
    const snap = await db.collection('banners').where('active','==',true).orderBy('order','asc').get();
    const banners = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (banners.length > 0) renderBannerCarousel(banners);
  } catch(e) { /* no banners configured */ }
}

function renderBannerCarousel(banners) {
  bannerCount = banners.length;
  bannerIndex = 0;
  const section = document.getElementById('banner-section');
  const track   = document.getElementById('banner-track');
  const dots    = document.getElementById('banner-dots');
  section.style.display = 'block';

  track.innerHTML = banners.map(b => `
    <div class="banner-slide">
      ${b.imageUrl ? `<img src="${b.imageUrl}" alt="${b.title}" />` : ''}
      <div class="banner-content">
        <div class="banner-label">Featured</div>
        <div class="banner-title">${b.title || ''}</div>
        <div class="banner-sub">${b.subtitle || ''}</div>
      </div>
    </div>`).join('');

  dots.innerHTML = banners.map((_,i) =>
    `<div class="banner-dot ${i===0?'active':''}" onclick="jumpBanner(${i})"></div>`).join('');

  if (bannerInterval) clearInterval(bannerInterval);
  bannerInterval = setInterval(() => slideBanner(1), 4500);
}

function slideBanner(dir) {
  if (bannerCount < 2) return;
  bannerIndex = (bannerIndex + dir + bannerCount) % bannerCount;
  applyBannerSlide();
}
function jumpBanner(i) { bannerIndex = i; applyBannerSlide(); }
function applyBannerSlide() {
  document.getElementById('banner-track').style.transform = `translateX(-${bannerIndex * 100}%)`;
  document.querySelectorAll('.banner-dot').forEach((d,i) => d.classList.toggle('active', i === bannerIndex));
}

// ----------------------------------------------------------------
// PRODUCTS — LOAD & RENDER
// ----------------------------------------------------------------
async function loadProducts() {
  showSpinner();
  try {
    const snap = await db.collection('products').get();
    products = snap.docs.map(d => {
      const data = d.data();
      // Apply mega discount on top of product discount
      const baseDiscount  = data.discount || 0;
      const effectivePct  = Math.min(baseDiscount + globalDiscount, 90);
      const effectivePrice = effectivePct > 0
        ? Math.round(data.price * (1 - effectivePct/100))
        : data.price;
      return { id: d.id, ...data, effectiveDiscount: effectivePct, effectivePrice };
    });
    filteredProds = [...products];
    buildCategoryFilters();
    renderProductGrid(filteredProds);
    const countEl = document.getElementById('products-count');
    if (countEl) countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''} available`;
  } catch(e) {
    document.getElementById('products-grid').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load products</h3><p>${e.message}</p></div>`;
  } finally { hideSpinner(); }
}

function buildCategoryFilters() {
  const cats = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
  const container = document.getElementById('category-filters');
  container.innerHTML = cats.map(cat => `
    <button class="filter-pill ${cat==='All'?'active':''}"
      data-cat="${cat.toLowerCase()}"
      onclick="filterByCategory(this,'${cat.toLowerCase()}')">
      ${cat}
    </button>`).join('');
}

function renderProductGrid(list) {
  const grid = document.getElementById('products-grid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>No products found</h3><p>Try a different search or category.</p></div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const inCart    = cart.some(c => c.id === p.id);
    const outOfStock = (p.stock || 0) <= 0;
    return `
    <div class="product-card" onclick="openProductDetail('${p.id}')">
      <div class="product-card-img">
        <img src="${p.imageUrl || 'https://picsum.photos/seed/'+p.id+'/400/400'}" alt="${p.name}" loading="lazy" />
        ${p.effectiveDiscount > 0 ? `<div class="discount-badge">-${p.effectiveDiscount}%</div>` : ''}
        ${outOfStock ? `<div class="out-of-stock-overlay">Out of Stock</div>` : ''}
      </div>
      <div class="product-card-body">
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-cat">${p.category || ''}</div>
        <div class="product-card-price">
          <span class="price-current">${fmtCurrency(p.effectivePrice)}</span>
          ${p.effectiveDiscount > 0 ? `<span class="price-original">${fmtCurrency(p.price)}</span>` : ''}
        </div>
      </div>
      ${!outOfStock ? `
      <div class="product-card-actions">
        <button class="btn ${inCart?'btn-secondary':'btn-primary'} btn-sm btn-full"
          onclick="event.stopPropagation();quickAddToCart('${p.id}')">
          ${inCart ? '✓ In Cart' : '+ Add to Cart'}
        </button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function filterByCategory(el, cat) {
  activeCategory = cat;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

function handleSearch(query) {
  applyFilters(query);
}

function applyFilters(searchQ = document.getElementById('search-input')?.value || '') {
  const q = searchQ.toLowerCase().trim();
  filteredProds = products.filter(p => {
    const matchCat    = activeCategory === 'all' || (p.category||'').toLowerCase() === activeCategory;
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.description||'').toLowerCase().includes(q) ||
      (p.category||'').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  renderProductGrid(filteredProds);
  const countEl = document.getElementById('products-count');
  if (countEl) countEl.textContent = `${filteredProds.length} product${filteredProds.length !== 1 ? 's' : ''} found`;
}

// ----------------------------------------------------------------
// PRODUCT DETAIL
// ----------------------------------------------------------------
async function openProductDetail(productId) {
  currentProductId = productId;
  showView('product');
  const p = products.find(x => x.id === productId);
  if (!p) return;

  document.getElementById('product-detail-content').innerHTML = `
    <div class="product-detail-image">
      <img src="${p.imageUrl || 'https://picsum.photos/seed/'+p.id+'/600/600'}" alt="${p.name}" />
    </div>
    <div class="product-detail-info">
      <div class="product-detail-cat">${p.category || 'General'}</div>
      <h1 class="product-detail-name">${p.name}</h1>
      <div class="product-detail-price">
        <span class="price-current">${fmtCurrency(p.effectivePrice)}</span>
        ${p.effectiveDiscount > 0 ? `
          <span class="price-original">${fmtCurrency(p.price)}</span>
          <span class="badge badge-accent">-${p.effectiveDiscount}% OFF</span>` : ''}
      </div>
      <p class="product-detail-desc">${p.description || 'No description available.'}</p>

      <div class="stock-info ${p.stock <= 0 ? 'out' : p.stock < 5 ? 'low' : ''}">
        ${p.stock <= 0 ? '❌ Out of stock' : p.stock < 5 ? `⚠️ Only ${p.stock} left!` : `✅ In stock (${p.stock} available)`}
      </div>

      ${p.stock > 0 ? `
      <div class="qty-control">
        <span class="qty-label">Quantity:</span>
        <div class="qty-btns">
          <button class="qty-btn" onclick="changeQty(-1)">−</button>
          <input class="qty-input" type="number" id="qty-input" value="1" min="1" max="${p.stock}" />
          <button class="qty-btn" onclick="changeQty(1)">+</button>
        </div>
      </div>
      <button class="btn btn-primary btn-full btn-lg" onclick="addToCartFromDetail('${p.id}')">
        🛒 Add to Cart
      </button>` :
      `<button class="btn btn-secondary btn-full btn-lg" disabled>Out of Stock</button>`}
    </div>`;
}

function changeQty(delta) {
  const inp = document.getElementById('qty-input');
  if (!inp) return;
  const p   = products.find(x => x.id === currentProductId);
  let   val = parseInt(inp.value) + delta;
  val = Math.max(1, Math.min(p?.stock || 99, val));
  inp.value = val;
}

function addToCartFromDetail(productId) {
  const p   = products.find(x => x.id === productId);
  const qty = parseInt(document.getElementById('qty-input')?.value) || 1;
  if (!p) return;
  addToCart(p, qty);
  toast(`${p.name} added to cart! 🛒`, 'success');
}

function quickAddToCart(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  addToCart(p, 1);
  toast(`${p.name} added to cart! 🛒`, 'success');
  renderProductGrid(filteredProds); // refresh button state
}

// ----------------------------------------------------------------
// CART — DATA LAYER
// ----------------------------------------------------------------
function addToCart(product, qty = 1) {
  const existing = cart.find(c => c.id === product.id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + qty, product.stock || 99);
  } else {
    cart.push({
      id:            product.id,
      name:          product.name,
      price:         product.effectivePrice,
      originalPrice: product.price,
      quantity:      qty,
      imageUrl:      product.imageUrl || '',
      category:      product.category || '',
      stock:         product.stock || 99,
    });
  }
  saveCartToStorage();
  updateCartBadge();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.id !== productId);
  saveCartToStorage();
  updateCartBadge();
  renderCart();
}

function updateCartQty(productId, delta) {
  const item = cart.find(c => c.id === productId);
  if (!item) return;
  item.quantity = Math.max(1, Math.min(item.quantity + delta, item.stock));
  saveCartToStorage();
  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const total = cart.reduce((s,c) => s+c.quantity, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) badge.textContent = total;
}

function getCartTotals() {
  const subtotal  = cart.reduce((s,c) => s + c.price * c.quantity, 0);
  const delivery  = subtotal > 0 && subtotal < 500 ? 50 : 0;
  const total     = subtotal + delivery;
  return { subtotal, delivery, total };
}

// ----------------------------------------------------------------
// CART — RENDER
// ----------------------------------------------------------------
function renderCart() {
  const { subtotal, delivery, total } = getCartTotals();
  const isEmpty = cart.length === 0;

  document.getElementById('cart-empty').style.display  = isEmpty ? 'block' : 'none';
  document.getElementById('cart-filled').style.display = isEmpty ? 'none'  : 'grid';
  document.getElementById('cart-items-count').textContent =
    `${cart.reduce((s,c)=>s+c.quantity,0)} item${cart.length!==1?'s':''}`;

  if (isEmpty) return;

  // Items
  document.getElementById('cart-items-list').innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img">
        <img src="${item.imageUrl || 'https://picsum.photos/seed/'+item.id+'/200/200'}" alt="${item.name}" />
      </div>
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-cat">${item.category}</div>
        <div class="cart-item-price">${fmtCurrency(item.price)} each</div>
        <div class="qty-btns" style="margin-top:8px;display:inline-flex;border-radius:6px;overflow:hidden;border:1px solid var(--border2)">
          <button class="qty-btn" style="width:30px;height:30px;font-size:16px" onclick="updateCartQty('${item.id}',-1)">−</button>
          <span style="width:40px;height:30px;display:flex;align-items:center;justify-content:center;background:var(--bg3);font-weight:700;font-size:14px;border-left:1px solid var(--border);border-right:1px solid var(--border)">${item.quantity}</span>
          <button class="qty-btn" style="width:30px;height:30px;font-size:16px" onclick="updateCartQty('${item.id}',1)">+</button>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-item-total">${fmtCurrency(item.price * item.quantity)}</div>
        <button class="cart-remove" onclick="removeFromCart('${item.id}')" title="Remove">🗑</button>
      </div>
    </div>`).join('');

  // Totals
  document.getElementById('cart-subtotal').textContent = fmtCurrency(subtotal);
  document.getElementById('cart-delivery').textContent = delivery > 0 ? fmtCurrency(delivery) : 'FREE';
  document.getElementById('cart-total').textContent    = fmtCurrency(total);

  const hint = document.getElementById('delivery-hint');
  if (delivery > 0) {
    hint.style.display = 'block';
    hint.textContent   = `💡 Add ${fmtCurrency(500-subtotal)} more to get FREE delivery!`;
  } else if (subtotal > 0) {
    hint.style.display = 'block';
    hint.textContent   = '✅ You qualify for FREE delivery!';
  } else {
    hint.style.display = 'none';
  }
}

// ----------------------------------------------------------------
// CHECKOUT FLOW
// ----------------------------------------------------------------
function goToCheckout() {
  if (cart.length === 0) { toast('Your cart is empty!', 'error'); return; }
  showView('checkout');
  goToAddressStep();
  loadAddresses();
}

function renderCheckoutSummary() {
  const { subtotal, delivery, total } = getCartTotals();
  orderTotal = total;
  document.getElementById('checkout-subtotal').textContent = fmtCurrency(subtotal);
  document.getElementById('checkout-delivery').textContent = delivery > 0 ? fmtCurrency(delivery) : 'FREE';
  document.getElementById('checkout-total').textContent    = fmtCurrency(total);
  document.getElementById('card-pay-amount').textContent   = fmtCurrency(total);
  document.getElementById('upi-amount-display').textContent = fmtCurrency(total);

  document.getElementById('checkout-order-items').innerHTML = cart.map(item => `
    <div class="order-item">
      <img class="order-item-img" src="${item.imageUrl || 'https://picsum.photos/seed/'+item.id+'/100/100'}" alt="${item.name}" />
      <div>
        <div class="order-item-name">${item.name}</div>
        <div class="order-item-qty">x ${item.quantity}</div>
      </div>
      <div class="order-item-price">${fmtCurrency(item.price * item.quantity)}</div>
    </div>`).join('');
}

// STEP 1 — ADDRESS
async function loadAddresses() {
  if (!currentUser) return;
  const snap = await db.collection('users').doc(currentUser.uid)
    .collection('addresses').orderBy('createdAt','desc').get();
  addresses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAddressList();
}

function renderAddressList() {
  const container = document.getElementById('saved-addresses-list');
  if (addresses.length === 0) {
    container.innerHTML = `<p style="color:var(--text2);font-size:14px;padding:8px 0">No saved addresses yet. Add one below.</p>`;
    return;
  }
  container.innerHTML = addresses.map(a => `
    <div class="address-card ${selectedAddressId===a.id?'selected':''}" onclick="selectAddress('${a.id}')">
      <div class="address-radio"></div>
      <div class="address-info">
        <h4>${a.name} &nbsp; ${a.phone}</h4>
        <p>${a.line1}${a.line2?', '+a.line2:''}, ${a.city}, ${a.state} — ${a.pincode}</p>
        ${a.isDefault ? '<div class="address-default">✓ Default address</div>' : ''}
      </div>
    </div>`).join('');
}

function selectAddress(id) {
  selectedAddressId = id;
  renderAddressList();
  document.getElementById('continue-to-payment-btn').disabled = false;

  // Update sidebar
  const a = addresses.find(x => x.id === id);
  if (a) {
    const summary = document.getElementById('checkout-address-summary');
    summary.style.display = 'block';
    document.getElementById('checkout-address-text').textContent =
      `${a.name}, ${a.line1}, ${a.city}, ${a.state} ${a.pincode}`;
  }
}

function goToAddressStep() {
  document.getElementById('checkout-step-1').style.display = 'block';
  document.getElementById('checkout-step-2').style.display = 'none';
  document.getElementById('step-indicator-1').classList.add('active');
  document.getElementById('step-indicator-2').classList.remove('active','done');
}

function goToPaymentStep() {
  if (!selectedAddressId) { toast('Please select a delivery address.', 'error'); return; }
  document.getElementById('checkout-step-1').style.display = 'none';
  document.getElementById('checkout-step-2').style.display = 'block';
  document.getElementById('step-indicator-1').classList.remove('active');
  document.getElementById('step-indicator-1').classList.add('done');
  document.getElementById('step-indicator-2').classList.add('active');
  selectPaymentMethod('card');
  renderCheckoutSummary();
}

function openAddAddressModal() {
  openModal(`
    <h3 class="modal-title">Add New Address</h3>
    <div class="form-group">
      <label>Full Name</label>
      <input type="text" id="a-name" placeholder="Recipient name" />
    </div>
    <div class="form-group">
      <label>Phone Number</label>
      <input type="tel" id="a-phone" placeholder="10-digit mobile" maxlength="10" />
    </div>
    <div class="form-group">
      <label>Address Line 1</label>
      <input type="text" id="a-line1" placeholder="House/Flat, Street" />
    </div>
    <div class="form-group">
      <label>Address Line 2 (optional)</label>
      <input type="text" id="a-line2" placeholder="Area, Landmark" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>City</label>
        <input type="text" id="a-city" placeholder="City" />
      </div>
      <div class="form-group">
        <label>State</label>
        <input type="text" id="a-state" placeholder="State" />
      </div>
    </div>
    <div class="form-group">
      <label>Pincode</label>
      <input type="text" id="a-pincode" placeholder="6-digit pincode" maxlength="6" />
    </div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:20px;color:var(--text1)">
      <input type="checkbox" id="a-default" /> <span style="font-size:14px">Set as default address</span>
    </label>
    <button class="btn btn-primary btn-full" onclick="saveNewAddress()">Save Address</button>
  `);
}

async function saveNewAddress() {
  const name    = document.getElementById('a-name').value.trim();
  const phone   = document.getElementById('a-phone').value.trim();
  const line1   = document.getElementById('a-line1').value.trim();
  const line2   = document.getElementById('a-line2').value.trim();
  const city    = document.getElementById('a-city').value.trim();
  const state   = document.getElementById('a-state').value.trim();
  const pincode = document.getElementById('a-pincode').value.trim();
  const isDef   = document.getElementById('a-default').checked;

  if (!name || !phone || !line1 || !city || !state || !pincode) {
    toast('Please fill in all required fields.', 'error'); return;
  }
  if (!/^\d{10}$/.test(phone))  { toast('Enter a valid 10-digit phone number.', 'error'); return; }
  if (!/^\d{6}$/.test(pincode)) { toast('Enter a valid 6-digit pincode.', 'error'); return; }

  try {
    showSpinner();
    const ref = await db.collection('users').doc(currentUser.uid)
      .collection('addresses').add({ name, phone, line1, line2, city, state, pincode, isDefault: isDef, createdAt: new Date() });
    addresses.unshift({ id: ref.id, name, phone, line1, line2, city, state, pincode, isDefault: isDef });
    closeModal();
    renderAddressList();
    selectAddress(ref.id);
    toast('Address saved! ✅', 'success');
  } catch(e) {
    toast('Failed to save address. Try again.', 'error');
  } finally { hideSpinner(); }
}

// STEP 2 — PAYMENT
function selectPaymentMethod(method) {
  paymentMethod = method;
  document.getElementById('tab-card').classList.toggle('active', method === 'card');
  document.getElementById('tab-upi').classList.toggle('active',  method === 'upi');
  document.getElementById('card-form').style.display = method === 'card' ? 'block' : 'none';
  document.getElementById('upi-form').style.display  = method === 'upi'  ? 'block' : 'none';
  if (method === 'upi') {
    document.getElementById('upi-qr-container').style.display = 'none';
    document.getElementById('upi-hint').style.display = 'block';
    document.querySelectorAll('.upi-app-btn').forEach(b => b.classList.remove('active'));
  }
}

function formatCardNumber(inp) {
  let v = inp.value.replace(/\D/g,'').substring(0,16);
  inp.value = v.match(/.{1,4}/g)?.join('  ') || v;
  const icon = document.getElementById('card-type-icon');
  if (v.startsWith('4'))                     icon.textContent = '💳 VISA';
  else if (v.startsWith('5'))                icon.textContent = '💳 MC';
  else if (v.startsWith('37')||v.startsWith('34')) icon.textContent = '💳 AMEX';
  else                                       icon.textContent = '💳';
}

function formatExpiry(inp) {
  let v = inp.value.replace(/\D/g,'');
  if (v.length > 2) v = v.substring(0,2) + ' / ' + v.substring(2,4);
  inp.value = v;
}

function selectUPIApp(el, appName) {
  document.querySelectorAll('.upi-app-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const names = { gpay:'Google Pay', phonepe:'PhonePe', paytm:'Paytm', bhim:'BHIM' };
  document.getElementById('upi-app-selected-name').textContent = `Pay with ${names[appName] || appName}`;

  // Generate QR
  const { total } = getCartTotals();
  const upiUrl = `upi://pay?pa=bazaar@paytm&pn=Bazaar+Shop&am=${total.toFixed(2)}&cu=INR&tn=Bazaar+Order`;
  document.getElementById('upi-qr-container').style.display = 'block';
  document.getElementById('upi-hint').style.display = 'none';

  const qrDiv = document.getElementById('qr-canvas');
  qrDiv.innerHTML = '';
  new QRCode(qrDiv, { text: upiUrl, width: 200, height: 200, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H });
}

async function payWithCard() {
  const number = document.getElementById('card-number').value.replace(/\s/g,'');
  const expiry = document.getElementById('card-expiry').value;
  const cvv    = document.getElementById('card-cvv').value;
  const name   = document.getElementById('card-name').value.trim();

  if (number.length < 16) { toast('Enter a valid 16-digit card number.','error'); return; }
  if (!expiry.includes('/')) { toast('Enter a valid expiry date (MM/YY).','error'); return; }
  if (cvv.length < 3)  { toast('Enter a valid CVV.','error'); return; }
  if (!name)           { toast('Enter the cardholder name.','error'); return; }

  const paymentDetails = { method: 'card', last4: number.slice(-4), expiry, cardName: name };
  await placeOrder(paymentDetails);
}

async function confirmUPIPayment() {
  const selectedApp = document.querySelector('.upi-app-btn.active');
  if (!selectedApp) { toast('Please select a UPI app.','error'); return; }
  const appName = selectedApp.querySelector('.upi-app-name').textContent;
  const paymentDetails = { method: 'upi', app: appName, upiId: 'bazaar@paytm' };
  await placeOrder(paymentDetails);
}

async function placeOrder(paymentDetails) {
  if (!currentUser || !selectedAddressId) return;
  showSpinner();
  try {
    const { subtotal, delivery, total } = getCartTotals();
    const address  = addresses.find(a => a.id === selectedAddressId);
    const orderId  = generateOrderId();
    const eta      = calcETA();

    const orderData = {
      orderId,
      userId:         currentUser.uid,
      userEmail:      currentUser.email,
      items:          cart.map(c => ({ ...c })),
      subtotal,
      deliveryCharge: delivery,
      total,
      address,
      paymentMethod:  paymentDetails.method,
      paymentDetails,
      status:         'confirmed',
      createdAt:      new Date(),
      eta,
    };

    await db.collection('orders').doc(orderId).set(orderData);

    // Clear cart
    cart = [];
    saveCartToStorage();
    updateCartBadge();

    toast('Order placed successfully! 🎉', 'success');
    showReceipt(orderData);
  } catch(e) {
    toast('Failed to place order: ' + e.message, 'error');
  } finally { hideSpinner(); }
}

// ----------------------------------------------------------------
// RECEIPT
// ----------------------------------------------------------------
function showReceipt(order) {
  showView('receipt');
  const payDisplay = order.paymentDetails.method === 'card'
    ? `Card ending in ${order.paymentDetails.last4}`
    : `${order.paymentDetails.app} (UPI)`;

  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-header">
      <div class="receipt-check">✅</div>
      <h1>Order Confirmed!</h1>
      <p>Thank you for shopping with Bazaar</p>
    </div>
    <div class="receipt-body">
      <!-- Order Info -->
      <div class="receipt-section">
        <div class="receipt-section-title">Order Details</div>
        <div class="receipt-row"><span class="label">Order ID</span><span class="value" style="color:var(--accent);font-family:'Fraunces',serif">${order.orderId}</span></div>
        <div class="receipt-row"><span class="label">Order Date</span><span class="value">${new Date(order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>
        <div class="receipt-row"><span class="label">Status</span><span class="badge badge-success">Confirmed</span></div>
      </div>

      <!-- Products -->
      <div class="receipt-section">
        <div class="receipt-section-title">Items Ordered</div>
        ${order.items.map(item => `
          <div class="receipt-product">
            <img src="${item.imageUrl || 'https://picsum.photos/seed/'+item.id+'/100/100'}" alt="${item.name}" />
            <div>
              <div class="receipt-product-name">${item.name}</div>
              <div class="receipt-product-qty">Qty: ${item.quantity} × ${fmtCurrency(item.price)}</div>
            </div>
            <div class="receipt-product-price">${fmtCurrency(item.price * item.quantity)}</div>
          </div>`).join('')}
      </div>

      <!-- Pricing -->
      <div class="receipt-section">
        <div class="receipt-section-title">Payment Summary</div>
        <div class="receipt-row"><span class="label">Subtotal</span><span class="value">${fmtCurrency(order.subtotal)}</span></div>
        <div class="receipt-row"><span class="label">Delivery</span><span class="value">${order.deliveryCharge > 0 ? fmtCurrency(order.deliveryCharge) : 'FREE'}</span></div>
        <div class="receipt-total-row"><span>Total Paid</span><span class="amount">${fmtCurrency(order.total)}</span></div>
      </div>

      <!-- Payment Method -->
      <div class="receipt-section">
        <div class="receipt-section-title">Payment</div>
        <div class="receipt-row"><span class="label">Method</span><span class="value">${payDisplay}</span></div>
        <div class="receipt-row"><span class="label">Status</span><span class="badge badge-success">✅ Paid</span></div>
      </div>

      <!-- Address -->
      <div class="receipt-section">
        <div class="receipt-section-title">Delivery Address</div>
        <div class="receipt-row"><span class="label">Name</span><span class="value">${order.address.name}</span></div>
        <div class="receipt-row"><span class="label">Phone</span><span class="value">${order.address.phone}</span></div>
        <div class="receipt-row"><span class="label">Address</span>
          <span class="value" style="text-align:right;max-width:60%">${order.address.line1}${order.address.line2?', '+order.address.line2:''}, ${order.address.city}, ${order.address.state} — ${order.address.pincode}</span>
        </div>
      </div>
    </div>
    <div class="receipt-footer">
      <div class="eta-badge">🚚 Estimated Delivery: ${order.eta}</div>
      <div style="font-size:13px;color:var(--text2)">Questions? Email: support@bazaar.shop</div>
    </div>`;
}

function printReceipt() {
  window.print();
}
