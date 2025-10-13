/** @type {import('plasmo').Config} */
module.exports = {
  // Add font preloading for better performance
  html: {
    preload: [
      {
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap",
        as: "style"
      },
      {
        href: "https://fonts.gstatic.com/s/dmsans/v14/rP2tp2ywxg089UriCZOIGA.ttf",
        as: "font",
        type: "font/ttf",
        crossorigin: "anonymous"
      }
    ]
  }
}
