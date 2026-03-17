# 🛍️ Bazaar — E-Commerce Web App

A full-featured e-commerce application built with **vanilla JS + Firebase**.

---

## 📁 File Structure

```
ecommerce/
├── index.html          ← User-facing shop (login, browse, cart, checkout, receipt)
├── admin.html          ← Admin panel (product management, orders, banners, settings)
├── app.js              ← User app logic
├── admin.js            ← Admin panel logic
├── styles.css          ← Shared styles (dark theme, responsive)
├── firebase-config.js  ← 🔑 YOU MUST EDIT THIS FILE
└── README.md           ← This file
```

---

## 🚀 Setup Instructions

### Step 1 — Create a Firebase Project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → follow the wizard
3. Go to **Project Settings → General → Your Apps → Web App**
4. Copy the `firebaseConfig` object

### Step 2 — Update `firebase-config.js`
Replace the placeholder values with your actual Firebase config:
```js
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  ...
};
```

### Step 3 — Enable Firebase Services
In your Firebase Console:
- **Authentication** → Sign-in method → Enable **Email/Password**
- **Firestore Database** → Create database → Start in **test mode** (for development)

### Step 4 — Set Firestore Security Rules (for production)
In Firestore → Rules tab, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /users/{uid}/addresses/{addrId} {
      allow read, write: if request.auth.uid == uid;
    }
    match /orders/{orderId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null && (resource.data.userId == request.auth.uid || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
    }
    match /banners/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    match /config/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

### Step 5 — Create Your Admin Account
1. Open `index.html` in a browser (with a local server or deployed)
2. Register a new account with your admin email
3. In the Firebase Console → Firestore → `users` collection → find your user document
4. Add a field: `isAdmin` = `true` (Boolean)
5. Now open `admin.html` and log in with those credentials

### Step 6 — Add Products
1. Open `admin.html`, log in as admin
2. Click **📋 Add Sample Data** to seed demo products immediately
3. Or use **+ Add Product** to add your own products

---

## 🛒 User Features

| Feature | Description |
|---|---|
| Auth | Email/password login & registration |
| Shop | Product grid with search & category filters |
| Banner carousel | Auto-scrolling banners from Firestore |
| Mega offer banner | Site-wide discount badge |
| Product detail | Full description, image, quantity selector |
| Cart | Add/remove/update items with live totals |
| Delivery charge | ₹50 if order < ₹500, else FREE |
| Checkout | Saved addresses + add new address |
| Card payment | Card number, CVV, expiry, name UI |
| UPI payment | App selector + auto-generated QR code with amount |
| Receipt | Full order summary, ETA, printable |

## ⚙️ Admin Features

| Feature | Description |
|---|---|
| Admin auth | Separate login with `isAdmin` Firestore flag |
| Product CRUD | Add, edit, delete products |
| Product discount | Per-product discount % slider |
| Mega discount | Site-wide extra discount with custom label |
| Banner management | Add/edit/delete/toggle banners |
| Orders view | All orders with payment details, searchable |
| Stats dashboard | Total products, orders, revenue, banners |

---

## 🎨 Tech Stack

- **Frontend**: Vanilla JS, CSS3 (CSS Variables, Grid, Flexbox)
- **Backend**: Firebase (Firestore + Authentication)
- **Fonts**: Fraunces (display) + Plus Jakarta Sans (UI)
- **QR Code**: qrcodejs (CDN)
- **Theme**: Warm dark, amber/coral accent

---

## 📱 UPI Payment Note

The QR code is generated with the UPI deep link format:
```
upi://pay?pa=bazaar@paytm&pn=Bazaar+Shop&am=AMOUNT&cu=INR
```
To use a real UPI ID, update the `upiUrl` in `app.js` → `selectUPIApp()` function:
```js
const upiUrl = `upi://pay?pa=YOUR_UPI_ID&pn=YOUR_SHOP_NAME&am=${total.toFixed(2)}&cu=INR`;
```

---

## 🌐 Hosting

Deploy to Firebase Hosting:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # Select your project, set public dir to "."
firebase deploy
```

Or simply open `index.html` via any static file server (e.g. VS Code Live Server, Python `http.server`).

> ⚠️ **Do not open index.html directly as a `file://` URL** — Firebase SDK requires HTTP/HTTPS.
