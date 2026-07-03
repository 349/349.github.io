---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
draft: false
kicker: "Clementine Vulgate"
lede: "One-line gloss of the passage in English."
summary: "Short summary for the home feed."
tags: ["vulgate", "latin", "public-domain"]
---

{{`{{< audio src="/audio/FILENAME.mp3" title="Read aloud" >}}`}}

<div class="textaudio__latin">

Latin text here, stanza by stanza.
Keep a blank line between stanzas.

</div>
