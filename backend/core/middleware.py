from django.utils.deprecation import MiddlewareMixin

class HealthCheckMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if request.path == '/health/':
            from django.http import HttpResponse
            return HttpResponse("OK")
        return None
