# md2rtfm

Use `@splunk-edu/md2rtfm` to convert README written in Markdown to PDFs. This guide is divided into the following sections: 

* Creating files for converstion
* Using the CLI
* Using a manifest file


## Creating files for conversion

`md2rtfm` converts files ending with `-readme.md` or `-README.md`. It's all about that hypen! It will not convert your default `README.md`. It uses the Markdown filename as the PDF filename. For example: 

| Input             | Output            |
| ---               | ---               |
| THIS-readme.md    | THIS-README.pdf   |
| that-README.md    | that-README.pdf   |

It capitalizes `-README` because we want users to RTFM! 


## Using the CLI

Generate one README:
```
npx md2rtfm
```

Generate all READMEs in your course directory using the `--recursive` or `-r` option:
```
npx md2rtfm -r
```


## Using a manifest file

Specify custom inputs and outputs using a manifest file: 
```yaml
input:
    rtfm:
        - ./etc/this-README.md
        - ./etc/THAT-readme.md
output:
    rtfm:
        - ./dist/this-fantastic-README.pdf
        - ./dist/THAT-FANTASTIC-readme.pdf
```

NOTE: The default output for all files is `./dist`. But if you use the custom output you need to specify `./dist` explicitly.