module.exports = function (eleventyConfig) {
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return new Date(dateObj).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  });
  // Copiar tal cual los archivos que no cambian (estilos, scripts, imágenes)
  eleventyConfig.addPassthroughCopy("style.css");
  eleventyConfig.addPassthroughCopy("booking.css");
  eleventyConfig.addPassthroughCopy("booking.js");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("projects/project.css");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("admin/index.html");
  eleventyConfig.ignores.add("comandos-sql-calendario.md");
  eleventyConfig.ignores.add("es/README");
  eleventyConfig.addGlobalData("permalink", () => {
    return (data) => `${data.page.filePathStem}.html`;
  });
  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site"
    },
    templateFormats: ["html", "njk", "md"],
    htmlTemplateEngine: "njk"
  };

};