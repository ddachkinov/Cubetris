using UnityEngine;
using UnityEngine.UI;
using TMPro; // For TextMeshPro - fallback to legacy Text if not available

namespace Cubetris
{
    /// <summary>
    /// Manages all UI elements including HUD, menus, and game state displays.
    /// Updates score, lives, level info, and shows/hides panels.
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        [Header("HUD Elements")]
        [SerializeField] private TextMeshProUGUI scoreText;
        [SerializeField] private TextMeshProUGUI livesText;
        [SerializeField] private TextMeshProUGUI levelText;
        [SerializeField] private TextMeshProUGUI targetText;
        [SerializeField] private Image nextCubePreview;
        [SerializeField] private GameObject hudPanel;

        [Header("Menu Panels")]
        [SerializeField] private GameObject mainMenuPanel;
        [SerializeField] private GameObject pauseMenuPanel;
        [SerializeField] private GameObject gameOverPanel;
        [SerializeField] private GameObject levelCompletePanel;

        [Header("Game Over Elements")]
        [SerializeField] private TextMeshProUGUI finalScoreText;

        [Header("Level Complete Elements")]
        [SerializeField] private TextMeshProUGUI levelCompleteScoreText;

        private void Start()
        {
            // Subscribe to game manager events
            if (GameManager.Instance != null)
            {
                GameManager.Instance.OnScoreChanged += UpdateScore;
                GameManager.Instance.OnLivesChanged += UpdateLives;
                GameManager.Instance.OnGameStateChanged += HandleGameStateChanged;
            }

            // Initialize UI
            ShowMainMenu();
        }

        private void OnDestroy()
        {
            // Unsubscribe from events
            if (GameManager.Instance != null)
            {
                GameManager.Instance.OnScoreChanged -= UpdateScore;
                GameManager.Instance.OnLivesChanged -= UpdateLives;
                GameManager.Instance.OnGameStateChanged -= HandleGameStateChanged;
            }
        }

        #region HUD Updates

        public void UpdateScore(int score)
        {
            if (scoreText != null)
            {
                scoreText.text = $"Score: {score:N0}";
            }
        }

        public void UpdateLives(int lives)
        {
            if (livesText != null)
            {
                livesText.text = $"Lives: {lives}";
            }
        }

        public void UpdateLevel(int level, int totalLevels)
        {
            if (levelText != null)
            {
                levelText.text = $"Level: {level}/{totalLevels}";
            }
        }

        public void UpdateTarget(int targetPoints)
        {
            if (targetText != null)
            {
                targetText.text = $"Target: {targetPoints:N0}";
            }
        }

        public void UpdateNextCubePreview(Color color)
        {
            if (nextCubePreview != null)
            {
                nextCubePreview.color = color;
            }
        }

        #endregion

        #region Panel Management

        private void HandleGameStateChanged(GameState newState)
        {
            switch (newState)
            {
                case GameState.Menu:
                    ShowMainMenu();
                    break;
                case GameState.Playing:
                    ShowHUD();
                    break;
                case GameState.Paused:
                    ShowPauseMenu(true);
                    break;
                case GameState.GameOver:
                    // Game Over is handled by ShowGameOver method
                    break;
                case GameState.LevelComplete:
                    // Level Complete is handled by ShowLevelComplete method
                    break;
            }
        }

        public void ShowMainMenu()
        {
            SetPanelActive(mainMenuPanel, true);
            SetPanelActive(hudPanel, false);
            SetPanelActive(pauseMenuPanel, false);
            SetPanelActive(gameOverPanel, false);
            SetPanelActive(levelCompletePanel, false);
        }

        public void ShowHUD()
        {
            SetPanelActive(mainMenuPanel, false);
            SetPanelActive(hudPanel, true);
            SetPanelActive(pauseMenuPanel, false);
            SetPanelActive(gameOverPanel, false);
            SetPanelActive(levelCompletePanel, false);
        }

        public void ShowPauseMenu(bool show)
        {
            SetPanelActive(pauseMenuPanel, show);
            SetPanelActive(hudPanel, !show);
        }

        public void ShowGameOver(int finalScore)
        {
            SetPanelActive(gameOverPanel, true);
            SetPanelActive(hudPanel, false);

            if (finalScoreText != null)
            {
                finalScoreText.text = $"Final Score: {finalScore:N0}";
            }
        }

        public void ShowLevelComplete(int score)
        {
            SetPanelActive(levelCompletePanel, true);
            SetPanelActive(hudPanel, false);

            if (levelCompleteScoreText != null)
            {
                levelCompleteScoreText.text = $"Score: {score:N0}";
            }
        }

        private void SetPanelActive(GameObject panel, bool active)
        {
            if (panel != null)
            {
                panel.SetActive(active);
            }
        }

        #endregion

        #region Button Callbacks

        public void OnStartGameButton()
        {
            if (GameManager.Instance != null)
            {
                GameManager.Instance.StartGame();
            }
        }

        public void OnResumeButton()
        {
            if (GameManager.Instance != null)
            {
                GameManager.Instance.TogglePause();
            }
        }

        public void OnRestartButton()
        {
            if (GameManager.Instance != null)
            {
                GameManager.Instance.RestartLevel();
            }
        }

        public void OnNextLevelButton()
        {
            if (GameManager.Instance != null)
            {
                GameManager.Instance.LoadNextLevel();
            }
        }

        public void OnQuitButton()
        {
            #if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
            #else
            Application.Quit();
            #endif
        }

        #endregion
    }
}
