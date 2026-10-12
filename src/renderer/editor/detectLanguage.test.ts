import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { describe, expect, it } from 'vitest'
import { detectLanguage } from './detectLanguage'

const POSITIVE: [lang: string, code: string][] = [
  [
    'javascript',
    `const fs = require('fs')
function readConfig(path) {
  const raw = fs.readFileSync(path, 'utf8')
  console.log('loaded', path)
  return JSON.parse(raw)
}`,
  ],
  [
    'javascript',
    `import express from 'express'
const app = express()
app.get('/', (req, res) => res.send('ok'))
export default app`,
  ],
  [
    'typescript',
    `interface User {
  id: number
  name: string
}
export function greet(user: User): string {
  return \`Hello \${user.name}\`
}`,
  ],
  [
    'typescript',
    `type Result<T> = { ok: true; data: T } | { ok: false; error: string }
const cache = new Map<string, number>()
export const get = (key: string): number | undefined => cache.get(key)`,
  ],
  [
    'tsx',
    `export function Button({ label }: { label: string }) {
  const [count, setCount] = useState<number>(0)
  return (
    <button onClick={() => setCount(count + 1)}>{label}</button>
  )
}`,
  ],
  [
    'css',
    `.card {
  display: flex;
  padding: 12px 16px;
  border-radius: 8px;
}
.card:hover {
  background-color: #f1f5f9;
}`,
  ],
  [
    'css',
    `@media (max-width: 600px) {
  body {
    font-size: 14px;
  }
}`,
  ],
  [
    'html',
    `<!DOCTYPE html>
<html>
  <head><title>Test</title></head>
  <body>
    <div class="app"><p>Hello</p></div>
  </body>
</html>`,
  ],
  [
    'html',
    `<ul class="nav">
  <li><a href="/">Home</a></li>
  <li><a href="/about">About</a></li>
</ul>`,
  ],
  [
    'json',
    `{
  "name": "slate",
  "version": "0.1.15",
  "private": true
}`,
  ],
  ['json', '[{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]'],
  [
    'python',
    `import os
from pathlib import Path

def list_notes(root):
    for p in Path(root).glob("*.md"):
        print(p.name)

if __name__ == "__main__":
    list_notes(os.getcwd())`,
  ],
  [
    'python',
    `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)`,
  ],
  [
    'sql',
    `SELECT u.id, u.name, COUNT(n.id) AS notes
FROM users u
LEFT JOIN notes n ON n.user_id = u.id
WHERE u.active = 1
GROUP BY u.id
ORDER BY notes DESC;`,
  ],
  [
    'sql',
    `CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  title VARCHAR(200) NOT NULL
);
INSERT INTO notes (title) VALUES ('hello');`,
  ],
  [
    'bash',
    `#!/bin/bash
set -e
for f in *.md; do
  echo "processing $f"
done`,
  ],
  [
    'bash',
    `cd my-project
npm install --save-dev typescript
git add -A
git commit -m "init"`,
  ],
  [
    'bash',
    `docker ps -a | grep slate | awk '{print $1}' | xargs docker rm
export NODE_ENV=production`,
  ],
  [
    'powershell',
    `Get-ChildItem -Path $env:USERPROFILE -Filter *.md -Recurse |
  Where-Object { $_.Length -gt 1kb } |
  ForEach-Object { Write-Host $_.FullName }`,
  ],
  [
    'powershell',
    `param([string]$Name)
if ($Name -eq $null) { Write-Error "missing" }
Set-Location $PSScriptRoot`,
  ],
  [
    'java',
    `package com.example;

import java.util.List;

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`,
  ],
  [
    'csharp',
    `using System;
using System.Collections.Generic;

namespace Demo
{
    public class Person
    {
        public string Name { get; set; }
        public void Greet() => Console.WriteLine($"Hi {Name}");
    }
}`,
  ],
  [
    'go',
    `package main

import "fmt"

func main() {
	msg, err := greet("slate")
	if err != nil {
		panic(err)
	}
	fmt.Println(msg)
}`,
  ],
  [
    'rust',
    `use std::collections::HashMap;

fn main() {
    let mut counts: HashMap<&str, i32> = HashMap::new();
    counts.insert("a", 1);
    println!("{:?}", counts);
}`,
  ],
  [
    'rust',
    `#[derive(Debug, Clone)]
pub struct Note {
    title: String,
}

impl Note {
    pub fn new(title: &str) -> Self {
        Note { title: title.to_string() }
    }
}`,
  ],
  [
    'php',
    `<?php
namespace App\\Http;

class NoteController {
    public function show($id) {
        return $this->repo->find($id);
    }
}`,
  ],
  [
    'yaml',
    `version: "3.8"
services:
  web:
    image: nginx:1.25
    ports:
      - "80:80"`,
  ],
  [
    'yaml',
    `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest`,
  ],
  [
    'xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <artifactId>demo</artifactId>
</project>`,
  ],
  [
    'cpp',
    `#include <iostream>

int main() {
    std::cout << "Hello" << std::endl;
    return 0;
}`,
  ],
]

const NEGATIVE: [name: string, text: string][] = [
  ['single sentence', 'This is just a normal sentence about my day.'],
  ['short single line', 'npm install'],
  ['short code-ish single line', 'const x = 1'],
  [
    'paragraphs',
    `I went to the store today and bought some milk.
Then I came home and made a cup of tea.

Tomorrow I need to call the bank about the card.`,
  ],
  [
    'paragraph with symbols',
    `Meeting notes (Monday): we agreed on the budget = $500.
Next steps: Alice & Bob will draft the plan; I will review it.`,
  ],
  [
    'bullet list',
    `- Buy milk
- Call mom
- Finish the quarterly report
- Book the dentist appointment`,
  ],
  [
    'checklist',
    `- [ ] write tests
- [x] fix the undo bug
- [ ] ship the release`,
  ],
  [
    'numbered list',
    `1. Open the settings
2. Choose a vault folder
3. Restart the app`,
  ],
  [
    'markdown with headings',
    `# Project ideas

## Notes app
A small local-first app for notes.

## Garden
- tomatoes
- basil`,
  ],
  [
    'markdown with inline code',
    `To install, run \`npm install\` in the project folder.
Then start it with \`npm run dev\` and open the window.`,
  ],
  [
    'markdown table',
    `| Name | Age |
|------|-----|
| Ali  | 30  |
| Ayşe | 28  |`,
  ],
  [
    'markdown quote',
    `> The best way to predict the future is to invent it.
> — Alan Kay`,
  ],
  ['url', 'https://github.com/codemirror/dev/issues/1234#issuecomment-99'],
  [
    'url list',
    `https://example.com/docs/getting-started
https://example.com/api?page=2&limit=10
https://news.ycombinator.com/item?id=123`,
  ],
  [
    'turkish prose',
    `Bugün markete gittim ve süt aldım.
Akşam yemeğinden sonra kitap okumayı düşünüyorum.
Yarın sabah erken kalkmam gerekiyor.`,
  ],
  [
    'turkish list',
    `- Ekmek al
- Faturayı öde
- Annemi ara`,
  ],
  [
    'key-value prose notes',
    `todo: buy milk and eggs
note: call the plumber tomorrow
idea: write a blog post about notes`,
  ],
  [
    'email',
    `Hi Sam,

Thanks for the update. Let's meet on Friday at 3pm to go over the plan.

Best,
Eren`,
  ],
  [
    'lowercase chat',
    `hey are you coming tonight
let me know if you want to grab food
i can pick you up around 8`,
  ],
  [
    'recipe',
    `Ingredients:
2 cups flour
1 tsp salt
Mix everything and bake for 20 minutes.`,
  ],
  [
    'address',
    `John Smith
221B Baker Street
London NW1 6XE`,
  ],
  ['empty', '   \n\n  '],
  [
    'keyword-led lowercase prose',
    "if you want to come, let me know\nfor now I'm staying home\nwhile you're out, buy bread",
  ],
  ['sql-ish prose', 'select one from the list below\nthen click save'],
  ['import-ish prose', 'import the data first\nthen export it as csv'],
  ['personal key/values', 'name: Eren\nage: 30\ncity: Istanbul'],
  ['turkish day plan', 'Pazartesi: spor\nSalı: yüzme\nÇarşamba: koşu'],
  ['math', 'x = 5\ny = 10\nx + y = 15'],
  ['chat log', '[10:32] Ali: selam\n[10:33] Veli: naber\n[10:34] Ali: iyi sen?'],
  [
    'slate formatting markers',
    '**Bold heading**\nSome _italic_ text and ==highlight=={.yellow}\n{color:red}red text{/color}',
  ],
  ['money list', '$ 100 for food\n$ 50 for gas\ntotal = $150'],
  ['poem', 'Roses are red\nViolets are blue\nSugar is sweet\nAnd so are you'],
]

describe('detectLanguage — code', () => {
  it.each(POSITIVE)('detects %s', (lang, code) => {
    expect(detectLanguage(code)?.language).toBe(lang)
  })

  it('handles CRLF line endings', () => {
    const code = (POSITIVE.find(([l]) => l === 'python')?.[1] ?? '').replace(/\n/g, '\r\n')
    expect(detectLanguage(code)?.language).toBe('python')
  })
})

describe('detectLanguage — prose is never code', () => {
  it.each(NEGATIVE)('rejects %s', (_name, text) => {
    expect(detectLanguage(text)).toBeNull()
  })
})

describe('detected ids', () => {
  it('all resolve in @codemirror/language-data (so the fence highlights)', () => {
    const ids = new Set(POSITIVE.map(([l]) => l))
    for (const id of ids) {
      expect(LanguageDescription.matchLanguageName(languages, id, true), id).not.toBeNull()
    }
  })
})
