module.exports = function(eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  // Date formatting filter
  eleventyConfig.addFilter("dateFormat", function(date) {
    const d = new Date(date);
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  });

  // Collections
  eleventyConfig.addCollection("adventures", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/blog/adventures/*.md").sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("ourStory", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/blog/our-story/*.md").sort((a, b) => b.date - a.date);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"]
  };
};
