(function () {
  var config = window.PORTFOLIO_CONFIG || {};
  var fallbackBaseUrl = "https://your-backend.example";

  function normalizeBaseUrl(value) {
    if (!value) {
      return "";
    }

    return String(value).replace(/\/+$/, "");
  }

  function setConfigLinks() {
    var links = document.querySelectorAll(".js-config-link");

    links.forEach(function (link) {
      var key = link.getAttribute("data-config-url");
      var value = config[key];

      if (value) {
        link.href = value;

        if (key !== "liveDemoBaseUrl") {
          link.target = "_blank";
          link.rel = "noreferrer";
        }

        return;
      }

      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      link.title = "Set " + key + " in site/config.js to enable this link.";
    });
  }

  function setLiveDemoCopy() {
    var demoState = document.querySelector(".js-demo-state");
    var createSnippet = document.querySelector(".js-create-snippet code");
    var statusSnippet = document.querySelector(".js-status-snippet code");
    var baseUrl = normalizeBaseUrl(config.liveDemoBaseUrl);
    var endpointBase = baseUrl || fallbackBaseUrl;

    if (createSnippet) {
      createSnippet.textContent = "POST " + endpointBase + "/webhook/pmf-brainstorm";
    }

    if (statusSnippet) {
      statusSnippet.textContent =
        "GET " + endpointBase + "/webhook/pmf-brainstorm-status?run_id=YOUR_RUN_ID";
    }

    if (demoState) {
      demoState.textContent = baseUrl
        ? "Live backend configured"
        : "No live backend configured yet";
    }
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
    setLiveDemoCopy();
    revealSections();
  });
})();
