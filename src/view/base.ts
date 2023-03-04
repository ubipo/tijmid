import { html } from "./html.js"


export function page(pageTitle: string, content: string) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>id.pfiers - ${pageTitle}</title>
      <style>
        body {
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
        }
        main {
          margin-top: 5%;
          max-width: 40em;
        }
        form > label {
          display: block;
        }
        form > label > input, form > label > textarea {
          display: block;
          margin-bottom: 1em;
        }
        form > label > input[type="checkbox"] {
          display: inline-block;
        }
        img {
          width: 100%;
        }
        nav > ul {
          display: flex;
          flex-direction: row;
          list-style: none;
          column-gap: 0.5em;
          padding: 0;
          margin-top: 0;
          margin-bottom: 0;
        }
        nav > ul:first-child {
          margin-top: 1em;
        }
        nav > ul:last-child {
          margin-bottom: 1em;
        }
        form > button {
          margin-right: 1em;
        }
      </style>
    </head>
    <body>
      <main id="main">
        <h1>${pageTitle}</h1>
        <hr>
        ${content}
      </main>
    </body>
    </html>
  `
}
