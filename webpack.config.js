const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: {
    client: './client/client.js'
  },
  output: {
    path: path.resolve(__dirname, 'client'),
    filename: '[name].bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/bpmn-js-token-simulation/assets',
          to: 'assets/bpmn-js-token-simulation'
        }
      ],
    })
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/, // Selecciona todo dentro de node_modules
          name: 'vendors', // Nombre del archivo de salida (ej. vendors.bundle.js)
          chunks: 'all',   // Incluye chunks síncronos y asíncronos
        },
      },
    },
  },
  devtool: 'cheap-module-source-map'
};