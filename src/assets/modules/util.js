export async function getDir(path) {
  const normalizedPath = path.endsWith("/") ? path : path + "/";
  const blacklist = path.split("/");

  const filesHTML = await fetch("/" + normalizedPath);
  const html = await filesHTML.text();

  const dom = new DOMParser();
  const doc = dom.parseFromString(html, "text/html");

  const links = doc.getElementsByTagName("a");

  return Array.from(links)
    .map((link) => link.innerHTML)
    .filter(
      (link) =>
        !Object.keys(blacklist).find(
          (index) => blacklist[index] + "/" == link
        ) &&
        link != "../" &&
        link != "/"
    );
}
