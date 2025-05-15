import puppeteer from "puppeteer";
import logger from "../utils/logger.js";

export async function generatePdf({
  htmlContent,
  outputPath,
  cssContent = "",
  logoPath,
  headerTemplate,
  footerTemplate,
}) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const fullHtml = cssContent
    ? `<style>${cssContent}</style>${htmlContent}`
    : htmlContent;

  await page.setContent(fullHtml, {
    waitUntil: ["domcontentloaded", "load", "networkidle0"],
  });

  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "25mm", bottom: "20mm", left: "20mm", right: "20mm" },
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
  });

  logger.info(`⚙️  Generating PDF ${outputPath}`);

  await browser.close();
}
