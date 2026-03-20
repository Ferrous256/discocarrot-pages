module.exports = function(eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  // Pass through HTML files as-is
  eleventyConfig.addPassthroughCopy("src/*.html");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "includes"
    },
    passthroughFileCopy: true
  };
};