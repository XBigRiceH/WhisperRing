module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo bundles the expo-router transform in SDK 54, so no
  // separate expo-router/babel plugin is required.
  return {
    presets: ['babel-preset-expo'],
  };
};
