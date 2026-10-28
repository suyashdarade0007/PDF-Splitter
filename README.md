# PDF Splitter v1.0

A mobile-friendly, static PDF splitting website. PDF files are processed in the user's browser with `pdf-lib`; ZIP downloads are created with `JSZip`. The site does not send the selected PDF to an application backend.

## Run locally

Open `index.html` in a modern browser while connected to the internet (the PDF libraries and fonts are loaded from CDNs).

For a local development server, from this folder run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to Vercel

1. Upload this folder to a GitHub repository.
2. In Vercel, import the repository.
3. Keep the framework preset as **Other** and leave build/output settings empty.
4. Deploy. `index.html` is served as a static site.

## Features

- Upload a PDF from desktop or mobile
- Split into equal page groups, with configurable starting page
- Enter custom ranges such as `1-2, 3-4, 5-7`
- Preview ranges before processing
- Name generated files using the assignment name
- Download each PDF separately or all as a ZIP
- PDF processing happens client-side; no backend is included

## Notes

- Internet is required to load the PDF libraries from the CDNs.
- Password-protected PDFs are not supported in this version.
- Large files can use significant device memory, especially on phones.
