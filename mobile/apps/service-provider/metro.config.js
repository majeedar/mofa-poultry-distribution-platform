const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..'); // mobile/

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so Metro can see mobile/shared/
config.watchFolders = [workspaceRoot];

// Resolve node_modules from the workspace root (where npm install ran)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
