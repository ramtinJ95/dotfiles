# Nightly Helm Air-Gap Smoke Test

Status: review draft

## Goal

Run a nightly installation test that proves the customer-facing Helm charts can start and operate when a private registry is the only image source and the installed workloads have no public network access.

This is a separate signal from the existing real-endpoint Helm acceptance test. It does not gate pull requests or releases.

## Decisions

- Add an independent nightly workflow, staggered after the existing 03:00 UTC acceptance workflow.
- Keep `workflow_dispatch` for investigation and verification.
- Do not add `pull_request`, release-please, or required-check triggers.
- Run on the existing `intric-smoke` ARC scale set.
- Create a fresh kind cluster for every run.
- Pull application images into kind from a persistent, plain private registry.
- Do not preload application images into kind.
- Do not use a pull-through registry or allow upstream fallback during the isolated test phase.
- Block public egress at both the kind-node and workload levels.
- Preserve the current two-namespace topology and functional assertions.
- Enable document ingestion and PDF preprocessing as standard supported air-gap workloads.
- Exercise one PDF through the isolated ingestion pipeline using in-cluster model mocks.
- Keep audio transcription disabled until it is part of the supported air-gap deployment and the runner requirements are defined.
- Use an unauthenticated HTTP registry for the initial implementation, matching the historical smoke-test contract.
- Defer registry TLS and authentication to a future improvement.
- Keep the existing real-endpoint acceptance workflow unchanged.

## What the test must prove

1. Every image rendered by the selected `intric-helm` and `intric-services` configuration points at the configured private registry.
2. The private registry contains every required image under the exact path produced by the charts' `global.imageRegistry` host-swap rule.
3. A fresh kind cluster can pull those images from the private registry.
4. The kind nodes cannot pull from GHCR, Docker Hub, or another public registry during chart installation.
5. No application image was preloaded into kind in a way that could hide a missing registry image.
6. Zitadel bootstrap completes and every selected Deployment and StatefulSet, including document ingestion and PDF preprocessing, becomes ready.
7. One PDF passes through the isolated ingestion pipeline and produces the expected mocked OCR content.
8. The backend health endpoint, frontend, in-cluster model mocks, and cross-namespace service path work.
9. Pods in both namespaces cannot reach the public internet.

## Non-goals

- Exercising real LLM, embedding, OCR, or Entra endpoints. The existing acceptance workflow owns those checks.
- Gating pull requests or chart releases.
- Reusing a long-lived kind cluster or its containerd cache.
- Treating static Helm rendering as a substitute for runtime image pulls.
- Reusing the existing GHCR and Docker Hub pull-through caches as the air-gap registry. Their upstream fallback would invalidate the test.
- Testing registry TLS, private certificate authorities, or registry authentication in the initial implementation.
- Running the audio transcription consumer before its supported air-gap and runner requirements are defined.

## Current state

The intended runtime path exists only in pieces:

```text
unmerged helm-smoke.yml
  -> setup-kind.sh mirror mode
  -> mirror-images.sh
  -> values-intric-{helm,services}.yaml
  -> egress-policy.yaml
  -> mock-llm.yaml
  -> assert.sh
```

The workflow is absent from `main`, so its schedule does not run. The latest historical run completed registry setup, mirroring, and both Helm installs, but the GitHub-hosted runner exhausted disk while kind unpacked images. No recorded air-gap run completed successfully.

The existing `.github/workflows/helm-acceptance.yml` is healthy and separate:

```text
03:00 UTC schedule
  -> intric-smoke ARC runner
  -> fresh kind cluster without global.imageRegistry
  -> pull-through caches with upstream fallback
  -> real endpoints and deep functional assertions
```

## Target architecture

```text
Staging Kubernetes
  |
  +-- persistent plain registry
  |     - no proxy configuration
  |     - persistent blob storage
  |     - no public egress
  |
  +-- ARC runner pod for the nightly job
        |
        +-- preparation phase with upstream access
        |     - render source image inventory
        |     - copy new or changed images directly into the registry
        |     - verify source and destination digests
        |
        +-- isolated test phase
              - create fresh kind cluster
              - configure containerd for the private registry
              - deny kind-node public egress
              - prove a mirrored pull succeeds
              - prove a public-registry pull fails
              - install both charts with global.imageRegistry
              - run functional and workload-egress assertions
              - delete the kind cluster
```

The persistent registry removes the repeated ephemeral registry copy. Kind still stores and unpacks the images required to run the workloads; that storage is unavoidable and is part of the evidence.

## Execution path

### 1. Build the required image inventory

- Render `helm/intric-helm` with `.github/scripts/smoke/values-intric-helm.yaml`.
- Render `helm/intric-services` with `.github/scripts/smoke/values-intric-services.yaml`.
- Enable document ingestion and PDF preprocessing in the air-gap services values.
- Extract and deduplicate all rendered image references.
- Add the mock/probe image used by `mock-llm.yaml` and `assert.sh`.
- Produce the destination reference using the same host-swap semantics as each chart's `intric.image` helper.
- Render both charts again with `global.imageRegistry` set and compare the resulting image set with the computed destination inventory.
- Fail before cluster setup if the inventories differ.

This makes helper drift explicit instead of waiting for an ambiguous `ImagePullBackOff`.

### 2. Populate the persistent registry

- Use a registry-to-registry copy tool rather than `docker pull`, `docker tag`, and `docker push`.
- Authenticate only to source registries that require it.
- Copy each source manifest to its destination path.
- Verify destination digest equality after each copy.
- Reuse existing content-addressed blobs; unchanged images should not consume another full local copy on the runner.
- Fail the preparation phase if any required source image cannot be copied.

The destination registry must have no `REGISTRY_PROXY_REMOTEURL` or equivalent fallback. A default-deny egress policy should make accidental proxying impossible.

### 3. Create the isolated cluster

- Reuse `setup-kind.sh` for kind topology and Calico bootstrap.
- Do not start the current local `registry:2` container.
- Configure every kind node's containerd to reach the persistent registry over its explicit internal endpoint.
- Complete infrastructure setup before isolation. Pulling the kind node image and Calico is test-fixture preparation, not part of the customer Helm installation.
- Confirm no target application image exists in the fresh kind containerd stores.

### 4. Enforce and prove node isolation

- Resolve and record the persistent registry endpoint before applying isolation.
- Permit kind internal traffic, pod/service CIDRs, DNS required by the nested cluster, and the private registry endpoint.
- Reject other outbound traffic from every kind node.
- Run a positive control that pulls the mirrored probe image from the private registry.
- Run a negative control that attempts to reach or pull from a public registry and must fail because of the network boundary.
- Fail immediately if either control gives the opposite result.

The isolation implementation must be verified not to interfere with kind control-plane or Calico traffic. The exact rules should be derived from the runtime Docker, pod, service, and registry networks rather than hard-coded assumptions.

### 5. Install and assert

- Create and label `intric-smoke` and `intric-smoke-services`.
- Pre-create the shared JWT and sandboxed-runner authentication Secrets in both namespaces.
- Apply the existing default-deny workload egress policy to both namespaces.
- Deploy the mock LLM from the private registry.
- Deploy an in-cluster OCR/model mock that satisfies the document and PDF consumers without public egress.
- Install `intric-helm` and `intric-services` with the persistent registry as `global.imageRegistry`.
- Inspect every Pod spec and fail if an image reference does not use the private registry.
- Require the document-ingestion and PDF-preprocessing Deployments to become ready after genuine private-registry pulls.
- Submit the existing PDF fixture through the application pipeline and require the completed job to expose the expected mocked OCR content.
- Run the existing bootstrap, rollout, backend, frontend, mock LLM, cross-namespace, and negative egress assertions.
- Record registry, node, pod, event, and disk diagnostics on failure.

## Repository changes

Expected implementation surfaces:

- `.github/workflows/helm-smoke.yml`
  - nightly and manual triggers only
  - `runs-on: intric-smoke`
  - schedule after the acceptance workflow
  - independent concurrency group
  - preparation and isolated-test phases reported separately

- `.github/scripts/smoke/mirror-images.sh`
  - replace the Docker-local copy path with digest-verified registry-to-registry copies
  - keep destination path generation aligned with both Helm helpers

- `.github/scripts/smoke/setup-kind.sh`
  - support the persistent registry endpoint without starting a local registry
  - preserve the acceptance workflow's no-registry mode

- `.github/scripts/smoke/assert.sh`
  - assert all runtime image references use the private registry
  - add or invoke the node-isolation positive and negative controls
  - assert document/PDF consumer readiness and one completed PDF ingestion

- `.github/scripts/smoke/values-intric-services.yaml`
  - enable document ingestion and PDF preprocessing
  - point their external model dependencies at in-cluster mocks
  - retain resource settings that fit the ARC runner without bypassing real image pulls

- `.github/scripts/smoke/mock-llm.yaml` or a focused replacement
  - provide deterministic embedding and OCR/model responses needed by the isolated PDF flow

- `.github/scripts/smoke/README.md`
  - describe the current nightly path and correct the two-namespace invocation

- `kubernetes/staging-v2/arc/`
  - add a plain registry Deployment, Service, PVC, security context, and default-deny egress policy
  - expose it only inside the staging cluster
  - keep it separate from the acceptance pull-through caches
  - place it under `registry-cache/` so the existing `arc-registry-cache` ArgoCD application manages it

No chart version or changelog files should be edited manually.

## Scheduling and concurrency

- Keep real-endpoint acceptance at 03:00 UTC.
- Schedule air-gap smoke at 05:00 UTC initially.
- Keep `workflow_dispatch` enabled.
- Use a separate workflow concurrency group while relying on the ARC scale set's `maxRunners: 1` to serialize actual runner allocation.
- Do not add PR, label, release-please, or release triggers.

## Storage management

- Size the registry PVC from the measured compressed unique-blob total plus at least 100% headroom. Do not guess solely from image tag count.
- Enable registry deletion support, but do not run unsafe online garbage collection.
- Report PVC consumption and runner/DinD free space in every run.
- Define a maintenance threshold before the PVC reaches exhaustion.
- Keep kind ephemeral so stale unpacked images cannot hide missing registry content.

## Failure semantics

The workflow should identify which boundary failed:

- `inventory`: rendered and mirrored image sets disagree.
- `preparation`: an upstream image cannot be copied or its digest cannot be verified.
- `registry`: the private registry is unavailable or missing an expected manifest.
- `isolation`: public access remains possible or private-registry access is blocked.
- `installation`: Helm installation or bootstrap fails.
- `runtime`: workloads fail readiness or functional assertions.
- `egress`: a workload reaches the public internet.
- `capacity`: registry PVC or runner/DinD storage is exhausted.

A failed preparation phase does not prove an air-gap regression. A failed isolated phase does.

## Rollout

1. Deploy the persistent registry without changing either nightly workflow.
2. Verify it has no proxy configuration, cannot make public egress connections, and retains blobs across pod replacement.
3. Update the smoke scripts and run the workflow from a trusted implementation branch or manual trusted ref.
4. Obtain two consecutive green manual runs, including a second run that demonstrates blob reuse.
5. Merge the nightly/manual workflow onto `main`.
6. Confirm the first scheduled run starts after acceptance and finishes without ARC contention.
7. Observe storage growth and runtime for at least one week before changing capacity or schedule.

## Acceptance criteria

- The workflow exists on `main` with only nightly and manual triggers.
- The workflow runs on `intric-smoke` and does not modify the existing acceptance workflow.
- The persistent registry has no upstream proxy or public egress.
- A fresh kind node successfully pulls a mirrored image.
- The same node cannot reach or pull from a public registry after isolation.
- No selected application image is preloaded before installation.
- Every rendered and running application image points to the private registry.
- Both Helm releases install successfully in separate namespaces.
- Zitadel bootstrap and all selected workloads become ready.
- Document ingestion and PDF preprocessing become ready after pulling their images from the private registry.
- The PDF fixture completes ingestion and exposes the expected mocked OCR content.
- Backend, frontend, in-cluster model mocks, and cross-namespace assertions pass.
- Public pod egress fails in both namespaces.
- Two consecutive manual runs pass, followed by one scheduled run.
- The second run reuses persistent registry blobs instead of recreating a full mirror inside the runner.

## Risks and mitigations

### Kind-node network isolation is too broad

Derive allow rules from runtime network values and run isolation controls before installing Helm. Dump rules and routes on failure.

### Persistent registry silently behaves as a proxy

Use a dedicated plain registry, omit all proxy settings, and deny registry-pod egress at the Kubernetes layer.

### Cached content hides missing images

Persist only the registry. Recreate kind every run, verify target images are absent before installation, and require real pulls.

### Registry and kind together still exhaust storage

Keep registry blobs outside DinD, use registry-to-registry copying, measure free space before installation, and retain only kind's unavoidable unpacked layers in the runner.

### ARC runner contention

Stagger the workflow by two hours and preserve the single-runner scale-set limit.

### Chart image helper and mirror path logic diverge

Compare the destination inventory computed from source refs with a second Helm render using `global.imageRegistry` before copying or installing.

## Resolved scope decisions

- Document ingestion and PDF preprocessing are part of the standard supported air-gap deployment. They must be enabled, pulled from the private registry, become ready, and participate in a functional PDF ingestion assertion.
- Audio transcription remains outside the test until its supported air-gap and runner requirements are defined.
- The initial private registry remains unauthenticated HTTP, matching the historical smoke harness. Registry TLS and authentication are a future improvement and are not part of the initial pass claim.

## Estimated effort

- Registry, workflow, consumer configuration, and script implementation: one to two focused days.
- Live node-isolation, 13 GB PDF image, model-mock, and storage debugging: one additional day of contingency.
- Registry TLS and authentication are excluded from this estimate.
