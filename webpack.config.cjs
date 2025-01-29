
const outputs={
  esm: {
    libraryTarget: 'module',
    path: `${__dirname}/dist`,
    filename: "index.js",
  },
  umd: {
    library: "rpc",
    libraryTarget: 'umd',
    path: `${__dirname}/dist`,
    filename: "index.umd.js",
  }
};
module.exports = (env,argv)=>["esm","umd"].map((type)=>({
    // モード値を production に設定すると最適化された状態で、
    // development に設定するとソースマップ有効でJSファイルが出力される
    mode: 'development',
    // メインとなるJavaScriptファイル（エントリーポイント）
    entry: './src/ngram.ts',
    experiments: {
    	outputModule: type==="esm",
    },
    output: outputs[type],
    module: {
        rules: [
            {
                // 拡張子 .ts の場合
                test: /\.ts$/,
                // TypeScript をコンパイルする
                use: {
        			loader:'ts-loader',
        			/*options:{
        				plugins: ['@babel/plugin-syntax-dynamic-import'],
        			},*/
        		},
            },
        ],
        parser: {
          javascript: {
            importMeta: !env.production,
          },
        },
    },
    resolve: {
        // 拡張子を配列で指定
        extensions: [
            '.ts', '.js',
        ],
    },
    plugins: [
    ],
}));
