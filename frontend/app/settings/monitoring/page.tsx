'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Activity, TrendingUp, AlertCircle, Database } from 'lucide-react';

interface MonitoringStatus {
  metrics_enabled: boolean;
  environment: string;
  monitoring: {
    grafana_url: string;
    prometheus_url: string;
    metrics_endpoint: string;
    health_endpoint: string;
  };
  status: string;
}

export default function MonitoringPage() {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/monitoring/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch monitoring status:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading monitoring status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Monitoring Status</CardTitle>
            <CardDescription>Unable to fetch monitoring status</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">모니터링</h1>
        <p className="text-gray-600">시스템 상태 및 메트릭을 실시간으로 확인하세요</p>
      </div>

      {/* Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            시스템 상태
          </CardTitle>
          <CardDescription>현재 모니터링 시스템 상태</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">메트릭 수집</p>
                <p className="text-2xl font-bold text-green-600">
                  {status.metrics_enabled ? '활성화' : '비활성화'}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">환경</p>
                <p className="text-2xl font-bold">{status.environment}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">상태</p>
                <p className="text-2xl font-bold text-green-600">{status.status}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monitoring Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Grafana 대시보드
            </CardTitle>
            <CardDescription>
              시각화된 메트릭 및 대시보드를 확인하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">접속 정보:</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                {status.monitoring.grafana_url}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                기본 계정: admin / admin
              </p>
            </div>
            <Button
              onClick={() => window.open(status.monitoring.grafana_url, '_blank')}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              대시보드 열기
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Prometheus
            </CardTitle>
            <CardDescription>
              메트릭 쿼리 및 알림 규칙을 관리하세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">접속 정보:</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                {status.monitoring.prometheus_url}
              </p>
            </div>
            <Button
              onClick={() => window.open(status.monitoring.prometheus_url, '_blank')}
              className="w-full"
              variant="outline"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Prometheus 열기
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            API 엔드포인트
          </CardTitle>
          <CardDescription>모니터링 관련 API 엔드포인트</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold">메트릭 엔드포인트</p>
                <p className="text-sm text-gray-600">{status.monitoring.metrics_endpoint}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}${status.monitoring.metrics_endpoint}`;
                  window.open(url, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold">헬스체크 엔드포인트</p>
                <p className="text-sm text-gray-600">{status.monitoring.health_endpoint}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}${status.monitoring.health_endpoint}`;
                  window.open(url, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Guide */}
      <Card>
        <CardHeader>
          <CardTitle>빠른 시작 가이드</CardTitle>
          <CardDescription>모니터링을 시작하는 방법</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. 모니터링 스택 시작</h3>
              <p className="text-sm text-gray-600 mb-2">
                프로젝트 루트에서 다음 명령어를 실행하세요:
              </p>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                scripts/start-monitoring.sh
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Windows의 경우: <code>scripts/start-monitoring.ps1</code>
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">2. Grafana 대시보드 확인</h3>
              <p className="text-sm text-gray-600">
                위의 "대시보드 열기" 버튼을 클릭하거나 직접 접속하세요.
                기본 계정으로 로그인하면 AgentGuard Overview 대시보드를 확인할 수 있습니다.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">3. 메트릭 확인</h3>
              <p className="text-sm text-gray-600">
                대시보드에서 API 요청률, 응답 시간, 에러율, LLM API 호출, 비용 등을
                실시간으로 확인할 수 있습니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
