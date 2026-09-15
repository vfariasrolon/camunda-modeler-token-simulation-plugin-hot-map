const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  // Se mantiene en 'development' (sin minificar) por dos motivos:
  //   1. Los stack traces conservan los nombres reales de modulo y variable.
  //      Con 'production' el error real aparecia como "l.default is not a
  //      constructor"; sin minificar se lee "ids__WEBPACK_IMPORTED_MODULE_0__.
  //      default is not a constructor", que es lo que permitio localizar la causa.
  //   2. El bundle resultante (~1,2 MB) es irrelevante para un plugin local.
  //
  // NOTA: 'development' NO es el arreglo de ningun bug. Se probo que el error
  // de "not a constructor" ocurre igual en ambos modos.
  mode: 'development',
  entry: './client/client.js',
  output: {
    path: path.resolve(__dirname, 'client'),
    filename: 'client.bundle.js'
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
  devtool: 'cheap-module-source-map'
};
