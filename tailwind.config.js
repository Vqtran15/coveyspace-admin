/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        coral: {
          light:   '#FEF4EE',
          100:     '#FBDDD0',
          DEFAULT: '#B85A3A',
          600:     '#9E4A2E',
          700:     '#833C22',
        },
        jade: {
          50:      '#FEF4EE',
          DEFAULT: '#C4622D',
          700:     '#A85228',
          800:     '#8C4220',
        },
        lagoon: {
          50:      '#FEF9EC',
          100:     '#FDEDC8',
          200:     '#FBD98A',
          DEFAULT: '#E8A838',
          600:     '#C48A20',
          700:     '#A07015',
        },
        sage: {
          50:      '#EDF6EE',
          DEFAULT: '#A1CCA6',
          700:     '#3D6E44',
        },
        sunrise: {
          50:      '#FBF8F4',
          DEFAULT: '#D4890A',
          800:     '#7A5010',
          900:     '#5A3A08',
        },
      },
    },
  },
  plugins: [],
}
