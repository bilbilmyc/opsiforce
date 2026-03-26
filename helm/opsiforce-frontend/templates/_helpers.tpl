{{- define "opsiforce-frontend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-frontend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else }}
{{- printf "%s-%s" (include "opsiforce-frontend.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "opsiforce-frontend.serviceName" -}}
{{- printf "%s-%s" (include "opsiforce-frontend.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-frontend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-frontend.labels" -}}
helm.sh/chart: {{ include "opsiforce-frontend.chart" . }}
{{ include "opsiforce-frontend.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "opsiforce-frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opsiforce-frontend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
