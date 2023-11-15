const axios = require("axios");
const cheerio = require("cheerio");
const readline = require("readline");
const { convert } = require("html-to-text");
let puppeteer = undefined;
let browser = undefined;
let page = undefined;
const usePuppeteer = process.argv.includes("--use-puppeteer");

(async () => {
  if (usePuppeteer) {
    puppeteer = require("puppeteer");
    browser = await puppeteer.launch();
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36"
    );
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const searchResults = [];
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
  const GOOGLE_SEARCH_URL = "https://www.google.com/search";

  async function searchGoogle(query) {
    const searchURL = `${GOOGLE_SEARCH_URL}?q=${encodeURIComponent(query)}`;
    try {
      let response;
      if (usePuppeteer) {
        response = await getPuppeteerResponse(searchURL, page);
      } else {
        response = await axiosResponse(searchURL);
      }
      return response;
    } catch (error) {
      throw new Error("Error fetching search results:", error.message);
    }
  }
  function parseSearchResults(html) {
    const $ = cheerio.load(html);
    const results = [];
    const searchElements = $("div.g");
    if (searchElements.length === 0) {
      console.log(greenBold("No search elements found with class 'g'"));
    }

    searchElements.each((index, element) => {
      const titleElement = $(element).find("h3");
      const descriptionElement = $(element).find("div.VwiC3b");
      const urlElement = $(element).find("a");

      const title = titleElement.text();
      const description = descriptionElement.text();
      const url = urlElement.attr("href");
      if (title && url) {
        results.push({
          title,
          description,
          url,
        });
      }
    });
    return results;
  }
  async function visitURL(idOrURL) {
    let url = "";
    if (parseInt(idOrURL)) {
      url = searchResults[idOrURL];
    } else {
      url = idOrURL;
    }
    if (url) {
      const loading = showLoading();
      try {
        let response;
        if (usePuppeteer) {
          response = await getPuppeteerResponse(url, page);
        } else {
          response = await axiosResponse(url);
        }
        const htmlData = response;
        const options = {
          wordwrap: 130,
        };
        clearInterval(loading);
        console.clear();
        const textData = convert(htmlData, options);
        console.log(textData);
        askForSearchTerm();
      } catch (error) {
        clearInterval(loading);
        console.clear();
        console.error("Error fetching URL content:", error.message);
        askForSearchTerm();
      }
    } else {
      clearInterval(loading);
      console.clear();
      console.log("The provided ID is invalid. Please enter a valid ID.");
      askForSearchTerm();
    }
  }

  function askForSearchTerm() {
    rl.question(
      'Enter your search query or command (or type "/exit" to quit) or type "/help" for instructions: ',
      async (answer) => {
        console.clear();
        if (!answer || answer.trim() === "") {
          console.log(yellowBold("Please provide a valid input.\n"));
          askForSearchTerm();
          return;
        } else if (answer.toLowerCase() === "/exit") {
          rl.close();
          return;
        } else if (answer.toLowerCase().startsWith("/v ")) {
          const answerSplit = answer.toLowerCase().split(" ");
          const idOrURL = answerSplit.slice(1).join(" ").trim();
          const id = parseInt(idOrURL);
          if (!isNaN(id)) {
            visitURL(id);
          } else {
            visitURL(idOrURL);
          }
          return;
        } else if (answer.toLowerCase() === "/help") {
          console.log(`
${blueBold("Instructions:")}
    ${yellowBold(`- Enter a search query or command directly.
      - Use '/v [ID]' to view a search result by its ID.
      - Use '/v URL' to visit a URL directly.
      - Type '/exit' to quit.
      - Use '/help' to display this help message.`)}
      `);
          askForSearchTerm();
          return;
        }
        const loading = showLoading();

        try {
          const html = await searchGoogle(answer);
          const results = parseSearchResults(html);
          if (results.length > 0) {
            clearInterval(loading);
            console.clear();
            console.log("Search Results:");
            results.forEach((result, index) => {
              const id = index + 1;
              console.log(
                `\n${id}. ${blueBold("Title:")} ${
                  result.title
                }\n   ${yellowBold("Description:")} ${
                  result.description
                }\n   ${magentaBold("URL:")} ${result.url}\n`
              );
              searchResults[id] = result.url;
            });
          } else {
            clearInterval(loading);
            console.clear();
            console.log("No results found.");
          }
          askForSearchTerm();
        } catch (error) {
          clearInterval(loading);
          console.clear();
          console.error(error.message);
          askForSearchTerm();
        }
      }
    );
  }

  console.log(`
${blueBold("Welcome to the search app!")}
${yellowBold(`    Use the following commands:
      - Enter a search query directly.
      - Use '/v [ID]' to view a search result from the list.
      - Use '/v URL' to directly visit a URL.
      - Type '/exit' to quit.`)}
`);

  askForSearchTerm();
  function blueBold(text) {
    return `\x1b[1m\x1b[34m${text}\x1b[0m`;
  }

  function greenBold(text) {
    return `\x1b[1m\x1b[32m${text}\x1b[0m`;
  }

  function yellowBold(text) {
    return `\x1b[1m\x1b[33m${text}\x1b[22m\x1b[39m`;
  }

  function cyanBold(text) {
    return `\x1b[1m\x1b[36m${text}\x1b[0m`;
  }

  function magentaBold(text) {
    return `\x1b[1m\x1b[35m${text}\x1b[0m`;
  }
  function showLoading() {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;
    return setInterval(() => {
      process.stdout.write("\r" + frames[i++ % frames.length] + " Loading... ");
    }, 100);
  }
  async function axiosResponse(url) {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html",
      },
    });
    return response.data;
  }
  async function getPuppeteerResponse(url, page) {
    try {
      if (!page) {
        throw new Error("Page instance not provided");
      }
      await page.goto(url, { waitUntil: "networkidle0" });
      await page.waitForNetworkIdle();
      const html = await page.content();
      return html;
    } catch (error) {
      throw new Error(`Error fetching page: ${error}`);
    }
  }
})();
