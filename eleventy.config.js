module.exports = function (eleventyConfig) {

  // Copiar tal cual los archivos que no cambian (estilos, scripts, imágenes)
  eleventyConfig.addPassthroughCopy("style.css");
  eleventyConfig.addPassthroughCopy("booking.css");
  eleventyConfig.addPassthroughCopy("booking.js");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("projects/project.css");
  eleventyConfig.addPassthroughCopy("projects/project.css");
  
  eleventyConfig.addGlobalData("permalink", () => {
    return (data) => `${data.page.filePathStem}.html`;
  });
  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site"
    },
    templateFormats: ["html", "njk"],
    htmlTemplateEngine: "njk"
  };

};