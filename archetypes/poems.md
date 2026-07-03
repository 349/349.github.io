---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: false
kicker: "POET NAME"
summary: "A line or two that stands for the poem."
tags: ["poetry", "public-domain"]
---

{{`{{< poem attribution="Poet, *Title* (year). Public domain / quoted with attribution." >}}`}}
Line one
Line two
{{`{{< /poem >}}`}}

An optional sentence on why it is here.
