using UnityEngine;
using System.Collections;

namespace Cubetris
{
    /// <summary>
    /// Handles cube spawning, track-based movement input, and launching mechanics.
    /// Manages the preview cube that player controls before launching.
    /// </summary>
    public class Spawner : MonoBehaviour
    {
        [Header("Spawn Settings")]
        [SerializeField] private Transform spawnPoint;
        [SerializeField] private float spawnHeight = 2f;
        [SerializeField] private float spawnZ = -10f;
        [SerializeField] private float spawnRate = 2f; // seconds between spawns

        [Header("Track Settings")]
        [SerializeField] private int trackCount = 10;
        [SerializeField] private float trackSpacing = 1.0f;
        [SerializeField] private int currentTrack = 0;

        [Header("Launch Settings")]
        [SerializeField] private float launchForce = 15f;
        [SerializeField] private float trackSwitchSpeed = 10f; // smooth movement between tracks

        [Header("Prefabs")]
        [SerializeField] private GameObject cubePrefab;

        [Header("Cube Colors")]
        [SerializeField] private Color[] cubeColors = new Color[]
        {
            Color.red,
            Color.blue,
            Color.green,
            Color.yellow,
            Color.magenta
        };

        [Header("Special Cubes")]
        [SerializeField] private float specialCubeChance = 0f;

        private CubeController currentCube;
        private CubeColorType nextCubeColor;
        private bool canSpawn = true;
        private bool isSpawning = false;
        private Coroutine spawnCoroutine;

        private void Start()
        {
            // Set initial track to center
            currentTrack = trackCount / 2;

            // Generate first preview color
            nextCubeColor = GetRandomCubeColor();

            // Create spawn point if not assigned
            if (spawnPoint == null)
            {
                GameObject sp = new GameObject("SpawnPoint");
                sp.transform.parent = transform;
                sp.transform.position = new Vector3(0, spawnHeight, spawnZ);
                spawnPoint = sp.transform;
            }
        }

        private void Update()
        {
            if (!isSpawning || GameManager.Instance?.CurrentState != GameState.Playing)
                return;

            HandleInput();
            UpdateCurrentCubePosition();
        }

        /// <summary>
        /// Handle player input for track movement and launching.
        /// </summary>
        private void HandleInput()
        {
            // Track switching
            if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
            {
                MoveTrack(-1);
            }
            else if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
            {
                MoveTrack(1);
            }

            // Launch
            if (Input.GetKeyDown(KeyCode.Space) && currentCube != null)
            {
                LaunchCube();
            }
        }

        /// <summary>
        /// Move to adjacent track.
        /// </summary>
        private void MoveTrack(int direction)
        {
            currentTrack = Mathf.Clamp(currentTrack + direction, 0, trackCount - 1);
            Debug.Log($"Moved to track {currentTrack}");
        }

        /// <summary>
        /// Smoothly update current cube position to match selected track.
        /// </summary>
        private void UpdateCurrentCubePosition()
        {
            if (currentCube == null) return;

            Vector3 targetPosition = GetTrackPosition(currentTrack);
            currentCube.transform.position = Vector3.Lerp(
                currentCube.transform.position,
                targetPosition,
                Time.deltaTime * trackSwitchSpeed
            );
        }

        /// <summary>
        /// Get world position for a given track index.
        /// </summary>
        private Vector3 GetTrackPosition(int trackIndex)
        {
            // Center the tracks around X=0
            float xOffset = (trackCount - 1) * trackSpacing * 0.5f;
            float xPos = (trackIndex * trackSpacing) - xOffset;

            return new Vector3(xPos, spawnHeight, spawnZ);
        }

        /// <summary>
        /// Start the spawning coroutine.
        /// </summary>
        public void StartSpawning()
        {
            isSpawning = true;
            if (spawnCoroutine == null)
            {
                spawnCoroutine = StartCoroutine(SpawnRoutine());
            }
        }

        /// <summary>
        /// Stop the spawning coroutine.
        /// </summary>
        public void StopSpawning()
        {
            isSpawning = false;
            if (spawnCoroutine != null)
            {
                StopCoroutine(spawnCoroutine);
                spawnCoroutine = null;
            }
        }

        /// <summary>
        /// Coroutine that spawns cubes at regular intervals.
        /// </summary>
        private IEnumerator SpawnRoutine()
        {
            // Spawn first cube immediately
            SpawnCube();

            while (isSpawning)
            {
                // Check spawn rate override
                float actualSpawnRate = GameManager.Instance?.SpawnRateOverride > 0
                    ? GameManager.Instance.SpawnRateOverride
                    : spawnRate;

                yield return new WaitForSeconds(actualSpawnRate);

                if (canSpawn && currentCube == null)
                {
                    SpawnCube();
                }
            }
        }

        /// <summary>
        /// Spawn a new cube at the spawn point.
        /// </summary>
        private void SpawnCube()
        {
            if (!canSpawn)
            {
                Debug.LogWarning("Cannot spawn - spawn area blocked!");
                if (GameManager.Instance != null)
                {
                    GameManager.Instance.TriggerGameOver();
                }
                return;
            }

            // Get cube from pool or instantiate
            GameObject cubeObj = ObjectPool.Instance != null
                ? ObjectPool.Instance.GetCube()
                : Instantiate(cubePrefab);

            cubeObj.transform.position = GetTrackPosition(currentTrack);
            cubeObj.transform.rotation = Quaternion.identity;

            currentCube = cubeObj.GetComponent<CubeController>();
            if (currentCube != null)
            {
                currentCube.Initialize(nextCubeColor, GetCubeColor(nextCubeColor));
                currentCube.SetKinematic(true); // Kinematic until launched
            }

            // Update UI with current color
            if (GameManager.Instance?.GetComponent<UIManager>() != null)
            {
                GameManager.Instance.GetComponent<UIManager>().UpdateNextCubePreview(GetCubeColor(nextCubeColor));
            }

            // Generate next color for preview
            nextCubeColor = GetRandomCubeColor();

            Debug.Log($"Spawned cube with color {nextCubeColor} on track {currentTrack}");
        }

        /// <summary>
        /// Launch the current cube forward.
        /// </summary>
        private void LaunchCube()
        {
            if (currentCube == null) return;

            // Make cube dynamic
            currentCube.SetKinematic(false);

            // Apply forward force
            Rigidbody rb = currentCube.GetComponent<Rigidbody>();
            if (rb != null)
            {
                rb.velocity = Vector3.forward * launchForce;
            }

            currentCube.OnLaunched();

            Debug.Log($"Launched cube from track {currentTrack}");

            // Clear reference - new cube will spawn on next cycle
            currentCube = null;
        }

        /// <summary>
        /// Get a random cube color type.
        /// </summary>
        private CubeColorType GetRandomCubeColor()
        {
            // Check for special cube chance
            if (Random.value < specialCubeChance)
            {
                return CubeColorType.Special;
            }

            // Return one of the 5 basic colors
            return (CubeColorType)Random.Range(0, 5);
        }

        /// <summary>
        /// Get Unity Color from color type.
        /// </summary>
        private Color GetCubeColor(CubeColorType colorType)
        {
            int index = (int)colorType;
            if (index >= 0 && index < cubeColors.Length)
            {
                return cubeColors[index];
            }
            return Color.white;
        }

        /// <summary>
        /// Reset spawner to initial state.
        /// </summary>
        public void ResetSpawner()
        {
            StopSpawning();

            if (currentCube != null)
            {
                if (ObjectPool.Instance != null)
                {
                    ObjectPool.Instance.ReturnCube(currentCube.gameObject);
                }
                else
                {
                    Destroy(currentCube.gameObject);
                }
                currentCube = null;
            }

            currentTrack = trackCount / 2;
            canSpawn = true;
            nextCubeColor = GetRandomCubeColor();
        }

        /// <summary>
        /// Set track count (called by LevelManager).
        /// </summary>
        public void SetTrackCount(int count)
        {
            trackCount = Mathf.Max(4, count);
            currentTrack = Mathf.Clamp(currentTrack, 0, trackCount - 1);
        }

        /// <summary>
        /// Set spawn rate (called by LevelManager).
        /// </summary>
        public void SetSpawnRate(float rate)
        {
            spawnRate = Mathf.Max(0.5f, rate);
        }

        /// <summary>
        /// Set special cube chance (called by LevelManager).
        /// </summary>
        public void SetSpecialCubeChance(float chance)
        {
            specialCubeChance = Mathf.Clamp01(chance);
        }

        /// <summary>
        /// Visualize tracks in editor.
        /// </summary>
        private void OnDrawGizmos()
        {
            if (!GameManager.Instance?.ShowDebugInfo ?? true) return;

            Gizmos.color = Color.cyan;

            for (int i = 0; i < trackCount; i++)
            {
                Vector3 trackPos = GetTrackPosition(i);

                // Draw track line
                Gizmos.DrawLine(trackPos, trackPos + Vector3.forward * 20f);

                // Highlight current track
                if (i == currentTrack)
                {
                    Gizmos.color = Color.yellow;
                    Gizmos.DrawWireSphere(trackPos, 0.5f);
                    Gizmos.color = Color.cyan;
                }
            }

            // Draw spawn point
            Gizmos.color = Color.green;
            if (spawnPoint != null)
            {
                Gizmos.DrawWireSphere(spawnPoint.position, 0.3f);
            }
        }
    }

    /// <summary>
    /// Enum for cube color types.
    /// </summary>
    public enum CubeColorType
    {
        Red = 0,
        Blue = 1,
        Green = 2,
        Yellow = 3,
        Magenta = 4,
        Special = 5
    }
}
