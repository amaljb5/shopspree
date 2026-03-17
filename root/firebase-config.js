// ================================================================
// FIREBASE CONFIGURATION
// Replace the values below with your own Firebase project config.
// Go to: Firebase Console → Project Settings → General → Your Apps
// ================================================================

const firebaseConfig = {
  apiKey: "AIzaSyAtjvj3tRrfiuO-yMuq6e9Pp2d7Ejuxv3g",
  authDomain: "shopspree-183e3.firebaseapp.com",
  projectId: "shopspree-183e3",
  storageBucket: "shopspree-183e3.firebasestorage.app",
  messagingSenderId: "25934649331",
  appId: "1:25934649331:web:10a9427ec116095f212486",
  measurementId: "G-7B049K2TZQ"
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
