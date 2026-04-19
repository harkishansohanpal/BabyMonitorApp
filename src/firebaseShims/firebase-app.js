// Shim: forces Metro to load @firebase/app (which has the react-native field)
// instead of the firebase/app wrapper (which has no react-native field and
// resolves to the browser bundle in React Native projects).
export * from '@firebase/app';
