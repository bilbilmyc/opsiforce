{{- define "opsiforce-backend.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-backend.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else }}
{{- printf "%s-%s" (include "opsiforce-backend.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "opsiforce-backend.serviceName" -}}
{{- printf "%s-%s" (include "opsiforce-backend.name" .) .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-backend.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "opsiforce-backend.labels" -}}
helm.sh/chart: {{ include "opsiforce-backend.chart" . }}
{{ include "opsiforce-backend.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "opsiforce-backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opsiforce-backend.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
