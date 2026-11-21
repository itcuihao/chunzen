//@ts-check
'use strict';

process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

/** 需要随扩展分发、不走 webpack 打理的静态资源 */
const STATIC_ASSETS = [
  // PDF.js 本体与 worker。两者都取自 node_modules，版本由 lockfile 唯一决定，
  // 不再从 CDN 加载（运行时的 3.11.174 与 devDependency 因此永远同源）。
  { from: 'node_modules/pdfjs-dist/build/pdf.min.js', to: 'pdfjs/pdf.min.js' },
  { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.js', to: 'pdfjs/pdf.worker.min.js' },
  // 中文等 CJK 字体的字符映射表，缺失时这些 PDF 的字形抽不出来
  { from: 'node_modules/pdfjs-dist/cmaps', to: 'pdfjs/cmaps' },
  // 标准字体，PDF 未内嵌字体时用它回退
  { from: 'node_modules/pdfjs-dist/standard_fonts', to: 'pdfjs/standard_fonts' },
  { from: 'src/webviews/pdfViewer/styles/pdfViewer.css', to: 'pdfViewer.css' }
];

/** @type {import('webpack').Configuration} */
const extConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  plugins: [
    new CopyPlugin({ patterns: STATIC_ASSETS })
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' }
};

/** @type {import('webpack').Configuration} */
const panelConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/webviews/sidePanel/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'panel.js'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'panel.css'
    })
  ],
  devtool: 'nosources-source-map'
};

/** @type {import('webpack').Configuration} */
const pdfViewerConfig = {
  target: 'web',
  mode: 'none',
  entry: './src/webviews/pdfViewer/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pdfViewer.js'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  devtool: 'nosources-source-map'
};

module.exports = [extConfig, panelConfig, pdfViewerConfig];