{{- define "opsiforce-bifrost.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-bifrost.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else }}
{{- printf "%s-%s" (include "opsiforce-bifrost.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "opsiforce-bifrost.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-bifrost.labels" -}}
helm.sh/chart: {{ include "opsiforce-bifrost.chart" . }}
{{ include "opsiforce-bifrost.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "opsiforce-bifrost.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opsiforce-bifrost.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
