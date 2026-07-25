function updateText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function setLanguage(language) {
  const selectedLanguage = translations[language];

  if (!selectedLanguage) {
    return;
  }

  document.documentElement.lang = language;

  updateText("nav-about", selectedLanguage.navAbout);
  updateText("nav-research", selectedLanguage.navResearch);
  updateText("nav-projects", selectedLanguage.navProjects);
  updateText("nav-writing", selectedLanguage.navWriting);
  updateText("nav-contact", selectedLanguage.navContact);

  updateText("hero-eyebrow", selectedLanguage.heroEyebrow);
  updateText("hero-title", selectedLanguage.heroTitle);
  updateText("hero-intro", selectedLanguage.heroIntro);

  const englishButton = document.getElementById("lang-en");
  const spanishButton = document.getElementById("lang-es");

  if (englishButton) {
    englishButton.classList.toggle("active", language === "en");
    englishButton.setAttribute(
      "aria-pressed",
      language === "en" ? "true" : "false"
    );
  }

  if (spanishButton) {
    spanishButton.classList.toggle("active", language === "es");
    spanishButton.setAttribute(
      "aria-pressed",
      language === "es" ? "true" : "false"
    );
  }

  localStorage.setItem("site-language", language);
}

document.addEventListener("DOMContentLoaded", function () {
  const englishButton = document.getElementById("lang-en");
  const spanishButton = document.getElementById("lang-es");

  if (englishButton) {
    englishButton.addEventListener("click", function () {
      setLanguage("en");
    });
  }

  if (spanishButton) {
    spanishButton.addEventListener("click", function () {
      setLanguage("es");
    });
  }

  const savedLanguage =
    localStorage.getItem("site-language") || "en";

  setLanguage(savedLanguage);
});
