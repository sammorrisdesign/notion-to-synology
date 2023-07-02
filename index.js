const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require('fs-extra');
const secrets = require('./secrets.json');

let pages = new Array;
const baseDir = './data/';
const notion = new Client({
  auth: secrets.notion.integration_secret,
});

const getSearchResults = async(start_cursor = undefined) => {
  console.log(`🔎 Getting Search Results ${start_cursor ? `(${start_cursor})` : ''}`);
  const searchResults = await notion.search({
    page_size: 50,
    start_cursor: start_cursor
  });

  // append search results to global bar
  pages.push(...searchResults.results);

  // if there's another page of search results, go again
  if (searchResults.has_more) {
    await getSearchResults(searchResults.next_cursor);
  }
}

const getPageContent = async() => {
  const n2m = new NotionToMarkdown({
    notionClient: notion,
    config: {
      parseChildPages:false
    }
  });

  // while we're getting page content, let's cast pages to a keyed object by id
  const pagesById = new Object;

  for (const i in pages) {
    const title = pages[i].properties.title.title[0].plain_text;
    console.log(`📄 Fetching ${title}`);

    // fetch blocks and convert to markdown
    const blocks = await n2m.pageToMarkdown(pages[i].id);
    const markdown = n2m.toMarkdownString(blocks);

    // convert page to cleaner structure for us
    pagesById[pages[i].id] = {
      title: title,
      content: markdown.parent,
      children: new Object,
      parent: pages[i].parent,
    }
  }

  pages = pagesById;
}

const getPathFromParent = async(id, path = '') => {
  const parentPage = pages[id];

  // if we have a parentPage amend path name
  if (parentPage) {
    path = `${parentPage.title}/` + path;
  }

  // if this has a parent page, recursively check it
  if (parentPage && parentPage.parent.page_id) {
    await getPathFromParent(parentPage.parent.page_id, path);

  // if not, we can stop and return the path we currently have
  } else {
    return path;
  }
}

const setPaths = async() => {
  const keys = Object.keys(pages);

  // loop through all pages and set paths
  // path getting is a seperate function so it can be used recursively
  for (let key of keys) {
    pages[key].path = await getPathFromParent(pages[key].parent.page_id);
  }
}

const saveFiles = async() => {
  // gut the folder
  fs.emptyDirSync(baseDir);

  // loop through all pages
  const keys = Object.keys(pages);
  for (let key of keys) {
    const path = baseDir + pages[key].path;

    // create folder if it doesn't exist, made recursive in case Notion returns things in a weird order
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true })
    }

    // if we have content, let's create a markdown file
    if (pages[key].content) {
      const fileName = pages[key].title + '.md';
      console.log(`💾 Saving ${path}${fileName}`);
      fs.writeFileSync(path + fileName, pages[key].content);
    }
  }
}

(async () => {
  await getSearchResults();
  await getPageContent();
  await setPaths();
  await saveFiles();
})();