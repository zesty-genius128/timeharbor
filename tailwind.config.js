module.exports = {
  content: [
    './client/**/*.{html,js}',
    './server/**/*.{js}',
    './collections.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
};