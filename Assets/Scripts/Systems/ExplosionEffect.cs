using UnityEngine;
using System.Collections.Generic;

namespace Cubetris
{
    /// <summary>
    /// Manages explosion effects with pixelated/voxel particles.
    /// Handles voxel spawning, physics, and pooling for performance.
    /// </summary>
    public class ExplosionEffect : MonoBehaviour
    {
        public static ExplosionEffect Instance { get; private set; }

        [Header("Voxel Settings")]
        [SerializeField] private GameObject voxelPrefab;
        [SerializeField] private int voxelsPerExplosion = 20;
        [SerializeField] private float voxelScale = 0.12f;
        [SerializeField] private float voxelLifetime = 2f;

        [Header("Explosion Physics")]
        [SerializeField] private float explosionForce = 5f;
        [SerializeField] private float explosionRadius = 0.5f;
        [SerializeField] private float randomForceVariation = 0.3f;

        [Header("Visual Effects")]
        [SerializeField] private GameObject sparkleParticlePrefab;
        [SerializeField] private float fadeStartTime = 1f;

        [Header("Audio")]
        [SerializeField] private AudioClip explosionSound;
        [SerializeField] private float explosionVolume = 0.7f;

        [Header("Performance")]
        [SerializeField] private int maxActiveVoxels = 200;
        [SerializeField] private bool useGPUParticlesWhenOverLimit = true;

        private List<VoxelController> activeVoxels = new List<VoxelController>();
        private AudioSource audioSource;

        private void Awake()
        {
            // Singleton setup
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            // Setup audio source
            audioSource = gameObject.AddComponent<AudioSource>();
            audioSource.playOnAwake = false;
            audioSource.spatialBlend = 0.5f; // 3D sound
        }

        /// <summary>
        /// Create an explosion at the specified position with the given color.
        /// </summary>
        public void CreateExplosion(Vector3 position, Color color)
        {
            // Check if we should use GPU particles instead
            if (activeVoxels.Count >= maxActiveVoxels && useGPUParticlesWhenOverLimit)
            {
                CreateGPUParticleExplosion(position, color);
                return;
            }

            // Spawn voxels
            for (int i = 0; i < voxelsPerExplosion; i++)
            {
                SpawnVoxel(position, color);
            }

            // Spawn sparkle particle effect
            if (sparkleParticlePrefab != null)
            {
                GameObject sparkle = Instantiate(sparkleParticlePrefab, position, Quaternion.identity);
                Destroy(sparkle, 3f); // Clean up after 3 seconds
            }

            // Play explosion sound
            PlayExplosionSound(position);

            Debug.Log($"Created explosion at {position} with {voxelsPerExplosion} voxels");
        }

        /// <summary>
        /// Spawn a single voxel with physics.
        /// </summary>
        private void SpawnVoxel(Vector3 centerPosition, Color color)
        {
            // Get voxel from pool or instantiate
            GameObject voxelObj = ObjectPool.Instance != null
                ? ObjectPool.Instance.GetVoxel()
                : Instantiate(voxelPrefab);

            // Random offset within explosion radius
            Vector3 randomOffset = Random.insideUnitSphere * explosionRadius;
            voxelObj.transform.position = centerPosition + randomOffset;
            voxelObj.transform.rotation = Random.rotation;
            voxelObj.transform.localScale = Vector3.one * voxelScale;

            // Get or add voxel controller
            VoxelController voxel = voxelObj.GetComponent<VoxelController>();
            if (voxel == null)
            {
                voxel = voxelObj.AddComponent<VoxelController>();
            }

            // Initialize voxel
            voxel.Initialize(color, voxelLifetime, fadeStartTime);

            // Apply explosion force
            Rigidbody rb = voxelObj.GetComponent<Rigidbody>();
            if (rb != null)
            {
                Vector3 forceDirection = (voxelObj.transform.position - centerPosition).normalized;
                forceDirection += Random.insideUnitSphere * randomForceVariation;

                float forceMagnitude = explosionForce * Random.Range(0.7f, 1.3f);
                rb.AddForce(forceDirection * forceMagnitude, ForceMode.Impulse);

                // Add random torque
                rb.AddTorque(Random.insideUnitSphere * explosionForce * 0.5f, ForceMode.Impulse);
            }

            // Track active voxel
            activeVoxels.Add(voxel);
            voxel.OnVoxelDestroyed += () => RemoveVoxelFromTracking(voxel);
        }

        /// <summary>
        /// Create GPU particle explosion (lightweight alternative).
        /// </summary>
        private void CreateGPUParticleExplosion(Vector3 position, Color color)
        {
            // Fallback to sparkle particles only when too many voxels
            if (sparkleParticlePrefab != null)
            {
                GameObject sparkle = Instantiate(sparkleParticlePrefab, position, Quaternion.identity);

                // Set particle color if possible
                ParticleSystem ps = sparkle.GetComponent<ParticleSystem>();
                if (ps != null)
                {
                    var main = ps.main;
                    main.startColor = color;
                }

                Destroy(sparkle, 3f);
            }

            PlayExplosionSound(position);

            Debug.Log($"Created GPU particle explosion at {position} (voxel limit reached)");
        }

        /// <summary>
        /// Play explosion sound effect.
        /// </summary>
        private void PlayExplosionSound(Vector3 position)
        {
            if (explosionSound != null && audioSource != null)
            {
                audioSource.transform.position = position;
                audioSource.PlayOneShot(explosionSound, explosionVolume);
            }
        }

        /// <summary>
        /// Remove voxel from active tracking.
        /// </summary>
        private void RemoveVoxelFromTracking(VoxelController voxel)
        {
            activeVoxels.Remove(voxel);
        }

        /// <summary>
        /// Clear all active explosions.
        /// </summary>
        public void ClearAllExplosions()
        {
            foreach (VoxelController voxel in activeVoxels)
            {
                if (voxel != null)
                {
                    voxel.ForceDestroy();
                }
            }

            activeVoxels.Clear();
        }

        // Public getters
        public int ActiveVoxelCount => activeVoxels.Count;
    }
}
