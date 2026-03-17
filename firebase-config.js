// ================================================================
// FIREBASE CONFIGURATION
// Replace the values below with your own Firebase project config.
// Go to: Firebase Console → Project Settings → General → Your Apps
// ================================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase (guard against double-init)
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db    = firebase.firestore();
const auth  = firebase.auth();

// ================================================================
// FIRESTORE DATA STRUCTURE (for reference):
//
// products/{productId}
//   name, description, price, imageUrl, category,
//   stock, discount (%), tags[]
//
// users/{uid}
//   email, displayName, isAdmin, createdAt
//   sub-collection: addresses/{addressId}
//     name, phone, line1, line2, city, state, pincode, isDefault
//
// orders/{orderId}
//   userId, items[], subtotal, deliveryCharge, total,
//   address{}, paymentMethod, paymentDetails{},
//   status, createdAt, eta, orderId
//
// banners/{bannerId}
//   title, subtitle, imageUrl, active, order
//
// config/global
//   megaDiscount (%), megaDiscountLabel
// ================================================================
