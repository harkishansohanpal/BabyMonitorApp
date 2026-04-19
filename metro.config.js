const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// 1. Enable package.json `exports` field resolution with react-native condition
// ---------------------------------------------------------------------------
// This makes Metro correctly resolve `firebase/auth` → @firebase/auth RN bundle
// (which has "react-native": "dist/rn/index.js" in its exports field).
// Without this, Metro ignores `exports` and falls back to the `browser` field,
// loading the ESM bundle that never calls registerAuth('ReactNative').
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'require', 'default'];

// ---------------------------------------------------------------------------
// 2. Fix react-native-reanimated TypeScript source issue
// ---------------------------------------------------------------------------
// reanimated v4 sets "react-native": "src/index" in package.json (TypeScript
// source). With package exports enabled, Metro would load that and crash on
// the missing jestUtils import. We intercept it and redirect to the compiled
// JS bundle before the exports resolver runs.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-reanimated') {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/react-native-reanimated/lib/module/index.js',
      ),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
