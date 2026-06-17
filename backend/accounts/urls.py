from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView, SimpleRegisterView, ProfileView, UserListView,
    UserApproveView, UserBlockView, UserUnblockView, UserChangeRoleView,
    UserToggleClubMembershipView, UserAssignClubView, UserDeleteView,
    AccountDeleteView,
    SendVerificationCodeView, VerifyCodeView, GoogleLoginView,
    VerifyPasswordView, ChangePasswordView, CustomTokenObtainPairView,
    PendingUserCountView, AdminNotificationsView, DashboardStatsView
)

urlpatterns = [
    # 이메일 인증
    path('send-verification/', SendVerificationCodeView.as_view(), name='send-verification'),
    path('verify-code/', VerifyCodeView.as_view(), name='verify-code'),

    # 인증
    path('register/', RegisterView.as_view(), name='register'),
    path('register/simple/', SimpleRegisterView.as_view(), name='register-simple'),
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # 소셜 로그인
    path('google/login/', GoogleLoginView.as_view(), name='google-login'),

    # 프로필
    path('profile/', ProfileView.as_view(), name='profile'),
    path('verify-password/', VerifyPasswordView.as_view(), name='verify-password'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('delete-account/', AccountDeleteView.as_view(), name='delete-account'),

    # 관리자
    path('users/dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('users/pending-count/', PendingUserCountView.as_view(), name='pending-user-count'),
    path('users/admin-notifications/', AdminNotificationsView.as_view(), name='admin-notifications'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/<int:pk>/approve/', UserApproveView.as_view(), name='user-approve'),
    path('users/<int:pk>/delete/', UserDeleteView.as_view(), name='user-delete'),
    path('users/<int:pk>/block/', UserBlockView.as_view(), name='user-block'),
    path('users/<int:pk>/unblock/', UserUnblockView.as_view(), name='user-unblock'),
    path('users/<int:pk>/change-role/', UserChangeRoleView.as_view(), name='user-change-role'),
    path('users/<int:pk>/toggle-club-membership/', UserToggleClubMembershipView.as_view(), name='user-toggle-club-membership'),
    path('users/<int:pk>/assign-club/', UserAssignClubView.as_view(), name='user-assign-club'),
]
