// QRScannerApp/babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // If you have react-native-reanimated, add this:
      // 'react-native-reanimated/plugin',
    ],
  };
};