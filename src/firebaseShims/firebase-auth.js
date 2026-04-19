// Shim: forces Metro to load @firebase/auth (which has "react-native": "dist/rn/index.js")
// instead of the firebase/auth wrapper (which has no react-native field and
// resolves to the browser ESM bundle, causing:
//   "Component auth has not been registered yet")
export * from '@firebase/auth';
