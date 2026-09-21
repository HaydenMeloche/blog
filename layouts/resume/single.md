# {{ .Params.name }}

{{ .Params.headline }}

Email: {{ .Params.contact.email }}  
LinkedIn: {{ .Params.contact.linkedin }}  
GitHub: {{ .Params.contact.github }}

## Experience
{{ range .Params.experience }}
### {{ .company }} — {{ .location }}
{{ range .roles }}
#### {{ .title }} · {{ .period }}
{{ range .highlights }}- {{ . }}
{{ end }}
{{ end }}
{{ end }}

## Projects & open source
{{ range .Params.projects }}
### [{{ .name }}]({{ .url }})
{{ range .highlights }}- {{ . }}
{{ end }}
{{ end }}
{{ range .Params.open_source }}- {{ . }}
{{ end }}
