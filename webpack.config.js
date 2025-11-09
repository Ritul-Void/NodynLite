import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'development',
  devtool: false,

  entry: {
    service_worker: './service_worker.js',
    sidebar: './sidebar.js',
    contentScript: './contentScript.js'
  },

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].js',
    chunkLoading: 'import-scripts',
    chunkFormat: 'array-push',
    module: true,
    library: {
      type: 'module'
    }
  },

  target: 'webworker',

  experiments: {
    outputModule: true
  },

  resolve: {
    extensions: ['.js']
  },

  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: '.' },
        { from: 'rules.json', to: '.' },
        { from: 'sidebar.html', to: '.' },
        { from: 'lib', to: 'lib' },
        { from: 'text', to: 'text' }
      ]
    })
  ],

  optimization: {
    splitChunks: false
  },

  performance: {
    hints: false
  }
};
