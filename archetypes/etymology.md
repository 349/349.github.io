---
title: "{{ replace .File.ContentBaseName "-" " " | lower }}"
date: {{ .Date }}
draft: false
summary: "A one-line hook — the surprising turn in the word's history."
tags: ["etymology"]
---

**{{ replace .File.ContentBaseName "-" " " | lower }}** *(n.)* — from ...

The story of the word.

Link related notes with: [word]({{`{{< ref "etymology/word" >}}`}}).
