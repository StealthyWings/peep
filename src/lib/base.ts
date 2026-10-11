// The app can live at the domain root ("/") or under a sub-path such as
// "/peep/" on GitHub Pages. Vite sets BASE_URL from the `base` option.

export const BASE = import.meta.env.BASE_URL

/** URL of a file in /public, e.g. asset('models/birdnet/model.json'). */
export const asset = (path: string) => BASE + path.replace(/^\//, '')
