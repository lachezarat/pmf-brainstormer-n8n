(function () {
  var config = window.PORTFOLIO_CONFIG || {};

  function setConfigLinks() {
    var links = document.querySelectorAll(".js-config-link");

    links.forEach(function (link) {
      var key = link.getAttribute("data-config-url");
      var value = config[key];

      if (value) {
        link.href = value;
        link.target = "_blank";
        link.rel = "noreferrer";

        return;
      }

      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.title = "Set " + key + " in site/config.js to enable this link.";
    });
  }

  function revealSections() {
    var nodes = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (node) {
        node.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
      }
    );

    nodes.forEach(function (node) {
      observer.observe(node);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setConfigLinks();
    revealSections();
  });
})();
