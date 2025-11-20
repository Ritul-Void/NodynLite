import path from 'path';
import { fileURLToPath } from 'url';

import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
    mode: 'development',
    devtool: 'inline-source-map',
    entry: {
        background: {
            import: './src/background.js',
            chunkLoading: `import-scripts`,
        },
        popup: './src/popup.js',
        content: './src/content.js',
        sidepanel: './src/sidepanel.js',
    },
    output: {
        path: path.resolve(__dirname, 'build').replace(/!/g, ''),
        filename: '[name].js',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup.html',
            filename: 'popup.html',
            chunks: ['popup'],
        }),
        new HtmlWebpackPlugin({
            template: './src/sidepanel.html',
            filename: 'sidepanel.html',
            chunks: ['sidepanel'],
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: "public",
                    to: "." // Copies to build folder
                },
                {
                    from: "src/popup.css",
                    to: "popup.css"
                },
                {
                    from: "src/sidepanel.css",
                    to: "sidepanel.css"
                }
            ],
        })
    ],
};

export default config;
